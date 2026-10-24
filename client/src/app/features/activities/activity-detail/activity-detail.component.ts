import { Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { ActivityService } from '../../../core/services/activity.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ApiError, ErrorCodes } from '../../../models/api';
import { ActivityAction, CLOSED_ACTIVITY_STATUSES } from '../../../models/enums';
import { Activity, ActivityActionRequest, ActivityNote } from '../../../models/models';
import { applyServerErrors, focusFirstInvalid } from '../../../shared/utils/form-utils';
import { requiredText } from '../../../shared/validators/app-validators';

export type ActivityDialog = 'complete' | 'cancel' | 'reopen';

interface ActionButton {
  action: ActivityAction;
  label: string;
  icon: string;
  cssClass: string;
}

/** Order and look of the action buttons; which of them exist for a record is decided by the server. */
const ACTION_BUTTONS: readonly ActionButton[] = [
  { action: ActivityAction.Edit, label: 'Edit', icon: 'bi-pencil', cssClass: 'btn-primary' },
  { action: ActivityAction.Complete, label: 'Complete', icon: 'bi-check-circle', cssClass: 'btn-success' },
  { action: ActivityAction.Reopen, label: 'Reopen', icon: 'bi-arrow-counterclockwise', cssClass: 'btn-outline-primary' },
  { action: ActivityAction.Cancel, label: 'Cancel activity', icon: 'bi-x-circle', cssClass: 'btn-outline-danger' }
];

const SUCCESS_MESSAGES: Record<ActivityDialog, (activity: Activity) => string> = {
  complete: activity => `Activity ${activity.activityNumber} was completed.`,
  cancel: activity => `Activity ${activity.activityNumber} was cancelled.`,
  reopen: activity => `Activity ${activity.activityNumber} was reopened.`
};

@Component({
  selector: 'app-activity-detail',
  templateUrl: './activity-detail.component.html'
})
export class ActivityDetailComponent implements OnInit, OnDestroy {
  static readonly maxNoteLength = 2000;
  static readonly maxOutcomeLength = 1000;

  private readonly destroy$ = new Subject<void>();

  readonly maxNoteLength = ActivityDetailComponent.maxNoteLength;
  readonly maxOutcomeLength = ActivityDetailComponent.maxOutcomeLength;
  readonly ActivityAction = ActivityAction;

  readonly noteForm = this.fb.nonNullable.group({
    noteText: ['', [requiredText, Validators.maxLength(ActivityDetailComponent.maxNoteLength)]]
  });

  /** The record as last loaded or returned by a write; its rowVersion is sent with the next write. */
  activity: Activity | null = null;
  actionButtons: ActionButton[] = [];
  notes: ActivityNote[] = [];

  loading = true;
  loadError: ApiError | null = null;
  concurrency = false;
  reloading = false;

  dialog: ActivityDialog | null = null;
  dialogError: ApiError | null = null;
  busy = false;

  addingNote = false;
  noteAlertMessages: string[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly host: ElementRef<HTMLElement>,
    private readonly activities: ActivityService,
    private readonly notifications: NotificationService
  ) {}

  get isClosed(): boolean {
    return !!this.activity && CLOSED_ACTIVITY_STATUSES.includes(this.activity.status);
  }

  get canAddNote(): boolean {
    return this.can(ActivityAction.AddNote);
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
        if (outcome.activity) {
          this.setActivity(outcome.activity);
        } else {
          this.activity = null;
          this.loadError = outcome.error;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  can(action: ActivityAction): boolean {
    return !!this.activity && this.activity.availableActions.includes(action);
  }

  open(dialog: ActivityDialog): void {
    this.dialogError = null;
    this.dialog = dialog;
  }

  closeDialog(): void {
    if (!this.busy) {
      this.dialog = null;
      this.dialogError = null;
    }
  }

  /** Complete (comment = outcome), Cancel (comment = reason) and Reopen (comment optional). */
  confirm(comment: string | null): void {
    const activity = this.activity;
    const dialog = this.dialog;
    if (!activity || !dialog || this.busy) {
      return;
    }

    const request: ActivityActionRequest = {
      activityId: activity.activityId,
      comment,
      rowVersion: activity.rowVersion
    };
    const call$ =
      dialog === 'complete'
        ? this.activities.complete(request)
        : dialog === 'cancel'
          ? this.activities.cancel(request)
          : this.activities.reopen(request);

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
          this.setActivity(updated);
          this.notifications.success(SUCCESS_MESSAGES[dialog](updated));
        },
        error: (error: unknown) => this.onActionFailed(ApiError.from(error))
      });
  }

  addNote(): void {
    const activity = this.activity;
    if (!activity || this.addingNote) {
      return;
    }
    this.noteAlertMessages = [];
    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.noteForm);
      return;
    }

    this.addingNote = true;
    this.activities
      .addNote({ activityId: activity.activityId, noteText: this.noteForm.controls.noteText.value.trim() })
      .pipe(
        finalize(() => (this.addingNote = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: updated => {
          this.setActivity(updated);
          this.noteForm.reset({ noteText: '' });
          this.notifications.success('Note added.');
        },
        error: (error: unknown) => this.onNoteFailed(ApiError.from(error))
      });
  }

  /** "Reload" of the concurrency panel: fetch the current version of the record again. */
  reload(): void {
    const activity = this.activity;
    if (!activity || this.reloading) {
      return;
    }
    this.reloading = true;
    this.activities
      .getById(activity.activityId)
      .pipe(
        finalize(() => (this.reloading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: reloaded => {
          this.concurrency = false;
          this.setActivity(reloaded);
        },
        error: (error: unknown) => this.notifications.error(ApiError.from(error).message)
      });
  }

  trackByNote(_index: number, note: ActivityNote): number {
    return note.noteId;
  }

  private fetch(idParam: string | null): Observable<{ activity: Activity | null; error: ApiError | null }> {
    const id = idParam !== null && /^\d+$/.test(idParam) ? Number(idParam) : null;
    if (id === null) {
      return of({ activity: null, error: new ApiError(404, ErrorCodes.notFound, 'Activity not found.') });
    }
    return this.activities.getById(id).pipe(
      map(activity => ({ activity, error: null })),
      catchError((error: unknown) => of({ activity: null, error: ApiError.from(error) }))
    );
  }

  private setActivity(activity: Activity): void {
    this.activity = activity;
    this.actionButtons = ACTION_BUTTONS.filter(button => activity.availableActions.includes(button.action));
    this.notes = [...activity.notes].sort((a, b) => {
      const difference = Date.parse(b.createdDate) - Date.parse(a.createdDate);
      return Number.isNaN(difference) || difference === 0 ? b.noteId - a.noteId : difference;
    });
  }

  private onActionFailed(error: ApiError): void {
    if (error.isConcurrency) {
      this.dialog = null;
      this.concurrency = true;
    } else {
      this.dialogError = error;
    }
  }

  private onNoteFailed(error: ApiError): void {
    if (error.isConcurrency) {
      this.concurrency = true;
    } else if (error.isValidation) {
      this.noteAlertMessages = applyServerErrors(this.noteForm, error);
    } else {
      this.notifications.error(error.message);
    }
  }
}
