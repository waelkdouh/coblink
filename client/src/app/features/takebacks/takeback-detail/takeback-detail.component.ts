import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { NotificationService } from '../../../core/services/notification.service';
import { TakebackService } from '../../../core/services/takeback.service';
import { ApiError, ErrorCodes } from '../../../models/api';
import { TakebackAction, TakebackStatus } from '../../../models/enums';
import {
  ActivityListItem,
  RecordRecoveryRequest,
  ResolveDisputeRequest,
  Takeback,
  TakebackActionRequest,
  TakebackHistoryEntry,
  TakebackRecovery
} from '../../../models/models';
import { daysBetween, formatShortDate, todayIso } from '../../../shared/utils/date-utils';
import { RecoveryFormValue } from '../record-recovery-dialog/record-recovery-dialog.component';
import { ResolveDisputeFormValue } from '../resolve-dispute-dialog/resolve-dispute-dialog.component';

export type CommentDialogKind = 'approve' | 'reject' | 'dispute' | 'writeOff' | 'cancel';
export type TakebackDialog = CommentDialogKind | 'submit' | 'sendNotice' | 'recordRecovery' | 'resolveDispute';

interface ActionButton {
  action: TakebackAction;
  label: string;
  icon: string;
  cssClass: string;
  /** The dialog the button opens; null for Edit, which is a link to the edit route. */
  dialog: TakebackDialog | null;
}

/** Order and look of the action buttons; which of them exist for a record is decided by the server. */
const ACTION_BUTTONS: readonly ActionButton[] = [
  { action: TakebackAction.Edit, label: 'Edit', icon: 'bi-pencil', cssClass: 'btn-primary', dialog: null },
  { action: TakebackAction.Submit, label: 'Submit for approval', icon: 'bi-send', cssClass: 'btn-primary', dialog: 'submit' },
  { action: TakebackAction.Approve, label: 'Approve', icon: 'bi-check-circle', cssClass: 'btn-success', dialog: 'approve' },
  { action: TakebackAction.Reject, label: 'Reject', icon: 'bi-x-circle', cssClass: 'btn-outline-danger', dialog: 'reject' },
  { action: TakebackAction.SendNotice, label: 'Send notice', icon: 'bi-envelope-paper', cssClass: 'btn-primary', dialog: 'sendNotice' },
  { action: TakebackAction.RecordRecovery, label: 'Record recovery', icon: 'bi-cash-coin', cssClass: 'btn-success', dialog: 'recordRecovery' },
  { action: TakebackAction.Dispute, label: 'Dispute', icon: 'bi-exclamation-triangle', cssClass: 'btn-outline-warning', dialog: 'dispute' },
  { action: TakebackAction.ResolveDispute, label: 'Resolve dispute', icon: 'bi-hammer', cssClass: 'btn-warning', dialog: 'resolveDispute' },
  { action: TakebackAction.WriteOff, label: 'Write off', icon: 'bi-slash-circle', cssClass: 'btn-outline-dark', dialog: 'writeOff' },
  { action: TakebackAction.Cancel, label: 'Cancel takeback', icon: 'bi-x-octagon', cssClass: 'btn-outline-danger', dialog: 'cancel' }
];

export interface CommentDialogConfig {
  title: string;
  message: string;
  label: string;
  confirmLabel: string;
  confirmClass: string;
  dismissLabel: string;
  required: boolean;
}

/** The actions that only need a comment (required, except for Approve). */
const COMMENT_DIALOGS: Record<CommentDialogKind, CommentDialogConfig> = {
  approve: {
    title: 'Approve takeback',
    message: 'The takeback is approved and a recovery notice can be sent.',
    label: 'Comment',
    confirmLabel: 'Approve',
    confirmClass: 'btn-success',
    dismissLabel: 'Cancel',
    required: false
  },
  reject: {
    title: 'Reject takeback',
    message: 'The creator can correct and resubmit a rejected takeback. Explain what has to change.',
    label: 'Reason for the rejection',
    confirmLabel: 'Reject takeback',
    confirmClass: 'btn-danger',
    dismissLabel: 'Cancel',
    required: true
  },
  dispute: {
    title: 'Record a dispute',
    message: 'Describe how the takeback is disputed. A supervisor will decide.',
    label: 'Dispute details',
    confirmLabel: 'Record dispute',
    confirmClass: 'btn-warning',
    dismissLabel: 'Cancel',
    required: true
  },
  writeOff: {
    title: 'Write off takeback',
    message: 'The outstanding balance is written off and the takeback is closed.',
    label: 'Reason for the write-off',
    confirmLabel: 'Write off',
    confirmClass: 'btn-dark',
    dismissLabel: 'Cancel',
    required: true
  },
  cancel: {
    title: 'Cancel takeback',
    message: 'The takeback is cancelled and cannot be reopened.',
    label: 'Reason for the cancellation',
    confirmLabel: 'Cancel takeback',
    confirmClass: 'btn-danger',
    dismissLabel: 'Keep takeback',
    required: true
  }
};

function isCommentDialog(dialog: TakebackDialog | null): dialog is CommentDialogKind {
  return dialog !== null && Object.prototype.hasOwnProperty.call(COMMENT_DIALOGS, dialog);
}

@Component({
  selector: 'app-takeback-detail',
  templateUrl: './takeback-detail.component.html'
})
export class TakebackDetailComponent implements OnInit, OnDestroy {
  static readonly maxCommentLength = 1000;

  private readonly destroy$ = new Subject<void>();

  readonly TakebackAction = TakebackAction;
  readonly maxCommentLength = TakebackDetailComponent.maxCommentLength;

  /** The record as last loaded or returned by a write; its rowVersion is sent with the next write. */
  takeback: Takeback | null = null;
  actionButtons: ActionButton[] = [];
  recoveries: TakebackRecovery[] = [];
  history: TakebackHistoryEntry[] = [];
  linkedActivities: ActivityListItem[] = [];
  /** Share of the takeback amount that is recovered, 0-100. */
  recoveredPercent = 0;

  loading = true;
  loadError: ApiError | null = null;
  concurrency = false;
  reloading = false;

  dialog: TakebackDialog | null = null;
  dialogError: ApiError | null = null;
  busy = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly takebacks: TakebackService,
    private readonly notifications: NotificationService
  ) {}

  /** Today, as promised by the "send notice" dialog (the server stamps the notice with its own today). */
  get today(): string {
    return todayIso();
  }

  /** Label of the third amount card: money left on a closed takeback is not "outstanding" any more. */
  get balanceLabel(): string {
    switch (this.takeback?.status) {
      case TakebackStatus.WrittenOff:
        return 'Written off';
      case TakebackStatus.Cancelled:
        return 'Not pursued';
      default:
        return 'Outstanding';
    }
  }

  /** True while the balance can still be collected, which is when it gets the red emphasis. */
  get balanceIsDue(): boolean {
    const status = this.takeback?.status;
    return !!this.takeback && this.takeback.outstandingAmount > 0 && status !== TakebackStatus.WrittenOff && status !== TakebackStatus.Cancelled;
  }

  /** Settings of the open dialog when it is a plain comment box. */
  get commentDialog(): CommentDialogConfig | null {
    return isCommentDialog(this.dialog) ? COMMENT_DIALOGS[this.dialog] : null;
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map(params => params.get('id')),
        tap(() => {
          this.loading = true;
          this.loadError = null;
          this.concurrency = false;
          this.dialog = null;
        }),
        switchMap(id => this.fetch(id)),
        takeUntil(this.destroy$)
      )
      .subscribe(outcome => {
        this.loading = false;
        if (outcome.takeback) {
          this.setTakeback(outcome.takeback);
        } else {
          this.takeback = null;
          this.loadError = outcome.error;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  can(action: TakebackAction): boolean {
    return !!this.takeback && this.takeback.availableActions.includes(action);
  }

  open(dialog: TakebackDialog): void {
    this.dialogError = null;
    this.dialog = dialog;
  }

  closeDialog(): void {
    if (!this.busy) {
      this.dialog = null;
      this.dialogError = null;
    }
  }

  /** Submit and SendNotice (plain confirmation) and the comment dialogs: Approve, Reject, Dispute, WriteOff, Cancel. */
  confirm(comment: string | null = null): void {
    const takeback = this.takeback;
    const dialog = this.dialog;
    if (!takeback || !dialog || this.busy) {
      return;
    }

    const request: TakebackActionRequest = { takebackId: takeback.takebackId, comment, rowVersion: takeback.rowVersion };
    switch (dialog) {
      case 'submit':
        this.run(this.takebacks.submit(request), updated => `Takeback ${updated.takebackNumber} was submitted for approval.`);
        break;
      case 'approve':
        this.run(this.takebacks.approve(request), updated => `Takeback ${updated.takebackNumber} was approved.`);
        break;
      case 'reject':
        this.run(this.takebacks.reject(request), updated => `Takeback ${updated.takebackNumber} was rejected.`);
        break;
      case 'sendNotice':
        this.run(this.takebacks.sendNotice(request), updated => this.noticeMessage(updated));
        break;
      case 'dispute':
        this.run(this.takebacks.dispute(request), updated => `Takeback ${updated.takebackNumber} is now disputed.`);
        break;
      case 'writeOff':
        this.run(this.takebacks.writeOff(request), updated => `Takeback ${updated.takebackNumber} was written off.`);
        break;
      case 'cancel':
        this.run(this.takebacks.cancel(request), updated => `Takeback ${updated.takebackNumber} was cancelled.`);
        break;
      default:
        break;
    }
  }

  recordRecovery(value: RecoveryFormValue): void {
    const takeback = this.takeback;
    if (!takeback || this.busy) {
      return;
    }
    const request: RecordRecoveryRequest = {
      takebackId: takeback.takebackId,
      amount: value.amount,
      recoveryDate: value.recoveryDate,
      method: value.method,
      referenceNumber: value.referenceNumber,
      notes: value.notes,
      rowVersion: takeback.rowVersion
    };
    this.run(this.takebacks.recordRecovery(request), updated =>
      updated.outstandingAmount === 0
        ? `Recovery recorded. Takeback ${updated.takebackNumber} is fully recovered.`
        : `Recovery recorded for takeback ${updated.takebackNumber}.`
    );
  }

  resolveDispute(value: ResolveDisputeFormValue): void {
    const takeback = this.takeback;
    if (!takeback || this.busy) {
      return;
    }
    const request: ResolveDisputeRequest = {
      takebackId: takeback.takebackId,
      comment: value.comment,
      rowVersion: takeback.rowVersion,
      upheld: value.upheld
    };
    this.run(this.takebacks.resolveDispute(request), updated =>
      value.upheld
        ? `Dispute upheld: takeback ${updated.takebackNumber} stands.`
        : `Dispute overturned: takeback ${updated.takebackNumber} was cancelled.`
    );
  }

  /** "Reload" of the concurrency panel: fetch the current version of the record again. */
  reload(): void {
    const takeback = this.takeback;
    if (!takeback || this.reloading) {
      return;
    }
    this.reloading = true;
    this.takebacks
      .getById(takeback.takebackId)
      .pipe(
        finalize(() => (this.reloading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: reloaded => {
          this.concurrency = false;
          this.setTakeback(reloaded);
        },
        error: (error: unknown) => this.notifications.error(ApiError.from(error).message)
      });
  }

  /** `SendNotice` -> "Send notice" for the history timeline. */
  actionLabel(action: string): string {
    const words = action.replace(/([a-z])([A-Z])/g, '$1 $2');
    return words.charAt(0) + words.slice(1).toLowerCase();
  }

  trackByRecovery(_index: number, recovery: TakebackRecovery): number {
    return recovery.recoveryId;
  }

  trackByHistory(_index: number, entry: TakebackHistoryEntry): number {
    return entry.historyId;
  }

  trackByActivity(_index: number, activity: ActivityListItem): number {
    return activity.activityId;
  }

  private fetch(idParam: string | null): Observable<{ takeback: Takeback | null; error: ApiError | null }> {
    const id = idParam !== null && /^\d+$/.test(idParam) ? Number(idParam) : null;
    if (id === null) {
      return of({ takeback: null, error: new ApiError(404, ErrorCodes.notFound, 'Takeback not found.') });
    }
    return this.takebacks.getById(id).pipe(
      map(takeback => ({ takeback, error: null })),
      catchError((error: unknown) => of({ takeback: null, error: ApiError.from(error) }))
    );
  }

  private run(call$: Observable<Takeback>, successMessage: (updated: Takeback) => string): void {
    this.busy = true;
    this.dialogError = null;
    call$
      .pipe(
        finalize(() => (this.busy = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: updated => {
          this.dialog = null;
          this.setTakeback(updated);
          this.notifications.success(successMessage(updated));
        },
        error: (error: unknown) => this.onActionFailed(ApiError.from(error))
      });
  }

  /** The response window is whatever the server configured: it is read from the dates of the result. */
  private noticeMessage(updated: Takeback): string {
    const base = `Notice sent for takeback ${updated.takebackNumber}.`;
    if (!updated.dueDate) {
      return base;
    }
    const days = updated.noticeDate ? daysBetween(updated.noticeDate, updated.dueDate) : null;
    const window = days === null ? '' : ` (${days} ${days === 1 ? 'day' : 'days'})`;
    return `${base} The response is due on ${formatShortDate(updated.dueDate)}${window}.`;
  }

  private setTakeback(takeback: Takeback): void {
    this.takeback = takeback;
    this.actionButtons = ACTION_BUTTONS.filter(button => takeback.availableActions.includes(button.action));
    this.recoveries = [...takeback.recoveries].sort(
      (a, b) => b.recoveryDate.localeCompare(a.recoveryDate) || b.recoveryId - a.recoveryId
    );
    this.history = [...takeback.history].sort((a, b) => {
      const difference = Date.parse(b.changedDate) - Date.parse(a.changedDate);
      return Number.isNaN(difference) || difference === 0 ? b.historyId - a.historyId : difference;
    });
    this.linkedActivities = takeback.linkedActivities;
    this.recoveredPercent =
      takeback.takebackAmount > 0
        ? Math.max(0, Math.min(100, Math.round((takeback.recoveredAmount / takeback.takebackAmount) * 100)))
        : 0;
  }

  private onActionFailed(error: ApiError): void {
    if (error.isConcurrency) {
      this.dialog = null;
      this.concurrency = true;
    } else {
      this.dialogError = error;
    }
  }
}
