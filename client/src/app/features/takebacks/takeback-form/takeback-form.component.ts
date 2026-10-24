import { Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { LookupService } from '../../../core/services/lookup.service';
import { NavigationHistoryService } from '../../../core/services/navigation-history.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TakebackService } from '../../../core/services/takeback.service';
import { ApiError, ErrorCodes } from '../../../models/api';
import { TakebackAction, TakebackReason } from '../../../models/enums';
import { LookupItem, SaveTakebackRequest, Takeback } from '../../../models/models';
import { toDateInputValue, toDatePayload, todayIso } from '../../../shared/utils/date-utils';
import { applyServerErrors, focusFirstInvalid, showError, textOrNull } from '../../../shared/utils/form-utils';
import {
  CLAIM_NUMBER_PATTERN,
  greaterThan,
  maxDecimals,
  notFutureDate,
  notGreaterThanControl,
  patternWithMessage,
  requiredText
} from '../../../shared/validators/app-validators';

interface LoadOutcome {
  takeback: Takeback | null;
  error: ApiError | null;
}

/** Create and edit share this component: `takebacks/new` and `takebacks/:id/edit`. */
@Component({
  selector: 'app-takeback-form',
  templateUrl: './takeback-form.component.html'
})
export class TakebackFormComponent implements OnInit, OnDestroy {
  static readonly maxClaimNumberLength = 30;
  static readonly maxCarrierNameLength = 150;
  static readonly maxPolicyNumberLength = 50;
  static readonly maxNotesLength = 2000;

  private readonly destroy$ = new Subject<void>();

  readonly showError = showError;
  readonly maxClaimNumberLength = TakebackFormComponent.maxClaimNumberLength;
  readonly maxCarrierNameLength = TakebackFormComponent.maxCarrierNameLength;
  readonly maxPolicyNumberLength = TakebackFormComponent.maxPolicyNumberLength;
  readonly maxNotesLength = TakebackFormComponent.maxNotesLength;

  readonly form = this.fb.group({
    claimNumber: this.fb.nonNullable.control('', [
      requiredText,
      Validators.maxLength(TakebackFormComponent.maxClaimNumberLength),
      patternWithMessage(CLAIM_NUMBER_PATTERN, 'Claim number can only contain letters, digits and dashes.')
    ]),
    memberId: this.fb.control<number | null>(null, Validators.required),
    providerId: this.fb.control<number | null>(null, Validators.required),
    reason: this.fb.control<TakebackReason | null>(null, Validators.required),
    dateOfService: this.fb.nonNullable.control('', [Validators.required, notFutureDate()]),
    originalPaidAmount: this.fb.control<number | null>(null, [Validators.required, greaterThan(0), maxDecimals(2)]),
    takebackAmount: this.fb.control<number | null>(null, [
      Validators.required,
      greaterThan(0),
      maxDecimals(2),
      notGreaterThanControl('originalPaidAmount', 'Takeback amount cannot be more than the original paid amount.')
    ]),
    otherCarrierName: this.fb.nonNullable.control('', Validators.maxLength(TakebackFormComponent.maxCarrierNameLength)),
    otherPolicyNumber: this.fb.nonNullable.control('', Validators.maxLength(TakebackFormComponent.maxPolicyNumberLength)),
    notes: this.fb.nonNullable.control('', Validators.maxLength(TakebackFormComponent.maxNotesLength))
  });

  reasons: LookupItem[] = [];

  isEdit = false;
  /** The record as last loaded or saved; its rowVersion is echoed back by the next save. */
  takeback: Takeback | null = null;
  memberLabel: string | null = null;
  providerLabel: string | null = null;

  loading = true;
  saving = false;
  reloading = false;
  loadError: ApiError | null = null;
  concurrency = false;
  alertMessages: string[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly host: ElementRef<HTMLElement>,
    private readonly takebacks: TakebackService,
    private readonly lookups: LookupService,
    private readonly notifications: NotificationService,
    private readonly history: NavigationHistoryService
  ) {}

  /** Today: the latest date of service. */
  get today(): string {
    return todayIso();
  }

  /** The other carrier fields only apply when another insurance is primary. */
  get isOtherInsurance(): boolean {
    return this.form.controls.reason.value === TakebackReason.OtherInsurancePrimary;
  }

  /** Only Draft and Rejected takebacks can be edited; the server says so through availableActions. */
  get canEdit(): boolean {
    return !this.takeback || this.takeback.availableActions.includes(TakebackAction.Edit);
  }

  get cancelFallbackUrl(): string {
    return this.takeback ? `/takebacks/${this.takeback.takebackId}` : '/takebacks';
  }

  ngOnInit(): void {
    this.reasons = this.lookups.getItems('takebackReasons');

    this.form.controls.reason.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(reason => this.onReasonChanged(reason));
    this.form.controls.originalPaidAmount.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.form.controls.takebackAmount.updateValueAndValidity());

    this.route.paramMap
      .pipe(
        map(params => params.get('id')),
        tap(() => this.beginLoad()),
        switchMap(id => this.load(id)),
        takeUntil(this.destroy$)
      )
      .subscribe(outcome => this.finishLoad(outcome));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  save(): void {
    if (this.saving) {
      return;
    }
    this.alertMessages = [];

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.form);
      return;
    }

    const request = this.buildRequest();
    if (!request) {
      return;
    }

    this.saving = true;
    this.takebacks
      .save(request)
      .pipe(
        finalize(() => (this.saving = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: saved => this.onSaved(saved),
        error: (error: unknown) => this.onSaveFailed(ApiError.from(error))
      });
  }

  cancel(): void {
    this.history.back(this.cancelFallbackUrl);
  }

  /** The "changed by another user" panel: fetch the current version again, discarding the unsaved edits. */
  reloadTakeback(): void {
    if (!this.takeback || this.reloading) {
      return;
    }
    this.reloading = true;
    this.takebacks
      .getById(this.takeback.takebackId)
      .pipe(
        finalize(() => (this.reloading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: takeback => {
          this.concurrency = false;
          this.alertMessages = [];
          this.applyTakeback(takeback);
        },
        error: (error: unknown) => this.notifications.error(ApiError.from(error).message)
      });
  }

  private beginLoad(): void {
    this.loading = true;
    this.loadError = null;
    this.concurrency = false;
    this.alertMessages = [];
  }

  private load(idParam: string | null): Observable<LoadOutcome> {
    if (idParam === null) {
      return of({ takeback: null, error: null });
    }
    const id = /^\d+$/.test(idParam) ? Number(idParam) : null;
    if (id === null) {
      return of({ takeback: null, error: new ApiError(404, ErrorCodes.notFound, 'Takeback not found.') });
    }
    return this.takebacks.getById(id).pipe(
      map(takeback => ({ takeback, error: null })),
      catchError((error: unknown) => of({ takeback: null, error: ApiError.from(error) }))
    );
  }

  private finishLoad(outcome: LoadOutcome): void {
    this.loading = false;
    if (outcome.error) {
      this.loadError = outcome.error;
      return;
    }

    if (outcome.takeback) {
      this.applyTakeback(outcome.takeback);
      return;
    }

    this.takeback = null;
    this.isEdit = false;
    this.memberLabel = null;
    this.providerLabel = null;
    this.form.reset(
      {
        claimNumber: '',
        memberId: null,
        providerId: null,
        reason: null,
        dateOfService: '',
        originalPaidAmount: null,
        takebackAmount: null,
        otherCarrierName: '',
        otherPolicyNumber: '',
        notes: ''
      },
      { emitEvent: false }
    );
    this.applyReasonRules(null);
  }

  /** Puts a loaded (or reloaded) takeback on screen and remembers it, with its rowVersion. */
  private applyTakeback(takeback: Takeback): void {
    this.takeback = takeback;
    this.isEdit = true;
    this.memberLabel = takeback.memberName ? `${takeback.memberName} (${takeback.memberNumber ?? takeback.memberId})` : null;
    this.providerLabel = takeback.providerName ? `${takeback.providerName} (${takeback.providerNumber ?? takeback.providerId})` : null;

    this.form.reset(
      {
        claimNumber: takeback.claimNumber,
        memberId: takeback.memberId,
        providerId: takeback.providerId,
        reason: takeback.reason,
        dateOfService: toDateInputValue(takeback.dateOfService),
        originalPaidAmount: takeback.originalPaidAmount,
        takebackAmount: takeback.takebackAmount,
        otherCarrierName: takeback.otherCarrierName ?? '',
        otherPolicyNumber: takeback.otherPolicyNumber ?? '',
        notes: takeback.notes ?? ''
      },
      { emitEvent: false }
    );
    this.applyReasonRules(takeback.reason);
  }

  /** Choosing another reason hides the other carrier fields, so their text goes with them. */
  private onReasonChanged(reason: TakebackReason | null): void {
    this.applyReasonRules(reason);
    if (reason !== TakebackReason.OtherInsurancePrimary) {
      this.form.controls.otherCarrierName.reset('', { emitEvent: false });
    }
  }

  /** The other carrier name is required, and only shown, when another insurance is primary. */
  private applyReasonRules(reason: TakebackReason | null): void {
    const carrier = this.form.controls.otherCarrierName;
    const lengthRule = Validators.maxLength(TakebackFormComponent.maxCarrierNameLength);
    carrier.setValidators(reason === TakebackReason.OtherInsurancePrimary ? [requiredText, lengthRule] : [lengthRule]);
    carrier.updateValueAndValidity({ emitEvent: false });
  }

  private buildRequest(): SaveTakebackRequest | null {
    const value = this.form.getRawValue();
    if (
      value.memberId === null ||
      value.providerId === null ||
      value.reason === null ||
      value.originalPaidAmount === null ||
      value.takebackAmount === null
    ) {
      return null;
    }
    const dateOfService = toDatePayload(value.dateOfService);
    if (dateOfService === null) {
      return null;
    }
    return {
      takebackId: this.takeback ? this.takeback.takebackId : 0,
      claimNumber: value.claimNumber.trim(),
      memberId: value.memberId,
      providerId: value.providerId,
      reason: value.reason,
      dateOfService,
      originalPaidAmount: value.originalPaidAmount,
      takebackAmount: value.takebackAmount,
      otherCarrierName: textOrNull(value.otherCarrierName),
      otherPolicyNumber: textOrNull(value.otherPolicyNumber),
      notes: textOrNull(value.notes),
      rowVersion: this.takeback ? this.takeback.rowVersion : null
    };
  }

  private onSaved(saved: Takeback): void {
    this.takeback = saved;
    this.notifications.success(
      this.isEdit ? `Takeback ${saved.takebackNumber} was saved.` : `Takeback ${saved.takebackNumber} was created.`
    );
    void this.router.navigate(['/takebacks', saved.takebackId], { replaceUrl: true });
  }

  private onSaveFailed(error: ApiError): void {
    if (error.isConcurrency) {
      this.concurrency = true;
    } else if (error.isValidation) {
      this.alertMessages = applyServerErrors(this.form, error);
      focusFirstInvalid(this.host.nativeElement, this.form);
    } else {
      this.notifications.error(error.message);
    }
  }
}
