import { formatCurrency } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { APP_LOCALE } from '../../../core/app-locale';
import { LookupService } from '../../../core/services/lookup.service';
import { ApiError } from '../../../models/api';
import { RecoveryMethod } from '../../../models/enums';
import { LookupItem, Takeback } from '../../../models/models';
import { formatShortDate, toDateInputValue, todayIso } from '../../../shared/utils/date-utils';
import { applyServerErrors, focusFirstInvalid, showError, textOrNull } from '../../../shared/utils/form-utils';
import {
  greaterThan,
  maxDecimals,
  maxValueOf,
  minDate,
  notFutureDate,
  requiredText
} from '../../../shared/validators/app-validators';

/** What the dialog hands to its parent; the parent adds the takeback id and the rowVersion. */
export interface RecoveryFormValue {
  amount: number;
  recoveryDate: string;
  method: RecoveryMethod;
  referenceNumber: string | null;
  notes: string | null;
}

/** Methods that leave a trace outside COBLink: the reference (check or EFT number) is mandatory. */
const METHODS_WITH_REFERENCE: readonly RecoveryMethod[] = [RecoveryMethod.Check, RecoveryMethod.Eft];

/** Dialog with the "record recovery" form of a takeback. */
@Component({
  selector: 'app-record-recovery-dialog',
  templateUrl: './record-recovery-dialog.component.html'
})
export class RecordRecoveryDialogComponent implements OnInit, OnDestroy {
  static readonly maxReferenceLength = 50;
  static readonly maxNotesLength = 500;

  @Input() takeback!: Takeback;
  /** True while the request runs: the buttons are disabled so the recovery cannot be recorded twice. */
  @Input() busy = false;

  @Output() confirmed = new EventEmitter<RecoveryFormValue>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  /** A check or EFT recovery needs its reference number. */
  private readonly referenceRule: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const method = control.parent?.get('method')?.value as RecoveryMethod | null | undefined;
    const required = method !== null && method !== undefined && METHODS_WITH_REFERENCE.includes(method);
    return required && requiredText(control)
      ? { referenceRequired: { message: 'A reference number is required for check and EFT recoveries.' } }
      : null;
  };

  readonly formId = 'record-recovery-form';
  readonly showError = showError;
  readonly maxReferenceLength = RecordRecoveryDialogComponent.maxReferenceLength;
  readonly maxNotesLength = RecordRecoveryDialogComponent.maxNotesLength;

  readonly form = this.fb.group({
    amount: this.fb.control<number | null>(null, [
      Validators.required,
      greaterThan(0),
      maxDecimals(2),
      maxValueOf(
        () => (this.takeback ? this.takeback.outstandingAmount : null),
        max => `Amount cannot be more than the outstanding balance of ${formatCurrency(max, APP_LOCALE, '$', 'USD')}.`
      )
    ]),
    recoveryDate: this.fb.nonNullable.control(todayIso(), [
      Validators.required,
      notFutureDate(),
      minDate(
        () => this.noticeDate,
        limit => `Recovery date cannot be before the notice date (${formatShortDate(limit)}).`
      )
    ]),
    method: this.fb.control<RecoveryMethod | null>(null, Validators.required),
    referenceNumber: this.fb.nonNullable.control('', [
      Validators.maxLength(RecordRecoveryDialogComponent.maxReferenceLength),
      this.referenceRule
    ]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(RecordRecoveryDialogComponent.maxNotesLength))
  });

  methods: LookupItem[] = [];
  /** Messages of the last failed attempt that do not belong to a field. */
  alertMessages: string[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly host: ElementRef<HTMLElement>,
    private readonly lookups: LookupService
  ) {}

  @Input()
  set error(value: ApiError | null) {
    this.alertMessages = !value ? [] : value.isValidation ? applyServerErrors(this.form, value) : [value.message];
  }

  /** The earliest recovery date: the day the notice was sent. */
  get noticeDate(): string {
    return this.takeback ? toDateInputValue(this.takeback.noticeDate) : '';
  }

  get today(): string {
    return todayIso();
  }

  get requiresReference(): boolean {
    const method = this.form.controls.method.value;
    return method !== null && METHODS_WITH_REFERENCE.includes(method);
  }

  ngOnInit(): void {
    this.methods = this.lookups.getItems('recoveryMethods');
    this.form.controls.method.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.form.controls.referenceNumber.updateValueAndValidity());
    this.form.updateValueAndValidity();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  useOutstanding(): void {
    this.form.controls.amount.setValue(this.takeback.outstandingAmount);
    this.form.controls.amount.markAsDirty();
  }

  submit(): void {
    if (this.busy) {
      return;
    }
    this.alertMessages = [];
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      focusFirstInvalid(this.host.nativeElement, this.form);
      return;
    }

    const value = this.form.getRawValue();
    if (value.amount === null || value.method === null) {
      return;
    }
    this.confirmed.emit({
      amount: value.amount,
      recoveryDate: value.recoveryDate,
      method: value.method,
      referenceNumber: textOrNull(value.referenceNumber),
      notes: textOrNull(value.notes)
    });
  }
}
