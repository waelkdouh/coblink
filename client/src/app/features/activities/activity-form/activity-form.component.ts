import { Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Observable, Subject, combineLatest, forkJoin, of, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { ActivityService } from '../../../core/services/activity.service';
import { LookupService } from '../../../core/services/lookup.service';
import { NavigationHistoryService } from '../../../core/services/navigation-history.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SessionService } from '../../../core/services/session.service';
import { TakebackService } from '../../../core/services/takeback.service';
import { ApiError, ErrorCodes } from '../../../models/api';
import { ActivityAction, ActivityPriority, ActivityStatus, ActivityType, EDITABLE_ACTIVITY_STATUSES } from '../../../models/enums';
import { Activity, AppUser, LookupItem, SaveActivityRequest, Takeback } from '../../../models/models';
import { toDateInputValue, toDatePayload, todayIso } from '../../../shared/utils/date-utils';
import { applyServerErrors, focusFirstInvalid, showError, textOrNull } from '../../../shared/utils/form-utils';
import { readInt } from '../../../shared/utils/query-utils';
import { minDate, requiredText } from '../../../shared/validators/app-validators';

interface LoadResult {
  users: AppUser[];
  activity: Activity | null;
  takeback: Takeback | null;
  memberId: number | null;
}

/** Create and edit share this component: `activities/new` and `activities/:id/edit`. */
@Component({
  selector: 'app-activity-form',
  templateUrl: './activity-form.component.html'
})
export class ActivityFormComponent implements OnInit, OnDestroy {
  static readonly maxSubjectLength = 200;
  static readonly maxDescriptionLength = 4000;

  private readonly destroy$ = new Subject<void>();

  readonly showError = showError;
  readonly maxSubjectLength = ActivityFormComponent.maxSubjectLength;
  readonly maxDescriptionLength = ActivityFormComponent.maxDescriptionLength;

  readonly form = this.fb.group({
    activityType: this.fb.control<ActivityType | null>(null, Validators.required),
    priority: this.fb.control<ActivityPriority | null>(ActivityPriority.Normal, Validators.required),
    status: this.fb.nonNullable.control<ActivityStatus>(ActivityStatus.Open, Validators.required),
    subject: this.fb.nonNullable.control('', [requiredText, Validators.maxLength(ActivityFormComponent.maxSubjectLength)]),
    description: this.fb.nonNullable.control('', Validators.maxLength(ActivityFormComponent.maxDescriptionLength)),
    assignedToUserId: this.fb.control<number | null>(null),
    dueDate: this.fb.nonNullable.control(''),
    // Optional: a general activity has neither a member nor a takeback; with a linked takeback the member comes from it.
    memberId: this.fb.control<number | null>(null)
  });

  types: LookupItem[] = [];
  priorities: LookupItem[] = [];
  statuses: LookupItem[] = [];
  users: AppUser[] = [];

  isEdit = false;
  /** The record as last loaded or saved; its rowVersion is echoed back by the next save. */
  activity: Activity | null = null;
  takebackId: number | null = null;
  linkedTakebackNumber: string | null = null;
  linkedMemberName: string | null = null;
  memberLabel: string | null = null;
  /** Assignee shown in the list although he or she is no longer an active user (edit only). */
  inactiveAssignee: { userId: number; name: string } | null = null;

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
    private readonly activities: ActivityService,
    private readonly takebacks: TakebackService,
    private readonly lookups: LookupService,
    private readonly session: SessionService,
    private readonly notifications: NotificationService,
    private readonly history: NavigationHistoryService
  ) {}

  /** Today: the earliest due date of a new activity. */
  get today(): string {
    return todayIso();
  }

  /** Completed and cancelled activities are read-only until they are reopened. */
  get canEdit(): boolean {
    return !this.activity || this.activity.availableActions.includes(ActivityAction.Edit);
  }

  /** The read-only panel only suggests Reopen when the server offers it; otherwise the user may not change the activity. */
  get canReopen(): boolean {
    return !!this.activity && this.activity.availableActions.includes(ActivityAction.Reopen);
  }

  get cancelFallbackUrl(): string {
    if (this.activity) {
      return `/activities/${this.activity.activityId}`;
    }
    return this.takebackId !== null ? `/takebacks/${this.takebackId}` : '/activities';
  }

  ngOnInit(): void {
    this.types = this.lookups.getItems('activityTypes');
    this.priorities = this.lookups.getItems('activityPriorities');
    this.statuses = this.lookups.getItems('activityStatuses').filter(item => EDITABLE_ACTIVITY_STATUSES.includes(item.id));

    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(
        tap(() => this.beginLoad()),
        switchMap(([params, query]) => this.load(params, query)),
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
    this.activities
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
  reloadActivity(): void {
    if (!this.activity || this.reloading) {
      return;
    }
    this.reloading = true;
    this.activities
      .getById(this.activity.activityId)
      .pipe(
        finalize(() => (this.reloading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: activity => {
          this.concurrency = false;
          this.alertMessages = [];
          this.applyActivity(activity);
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

  private load(params: ParamMap, query: ParamMap): Observable<{ result: LoadResult | null; error: ApiError | null }> {
    const idParam = params.get('id');
    const takebackId = readInt(query, 'takebackId');
    const memberId = readInt(query, 'memberId');

    let entity$: Observable<{ activity: Activity | null; takeback: Takeback | null }>;
    if (idParam !== null) {
      const id = /^\d+$/.test(idParam) ? Number(idParam) : null;
      entity$ =
        id === null
          ? throwError(() => new ApiError(404, ErrorCodes.notFound, 'Activity not found.'))
          : this.activities.getById(id).pipe(map(activity => ({ activity, takeback: null })));
    } else if (takebackId !== null) {
      entity$ = this.takebacks.getById(takebackId).pipe(map(takeback => ({ activity: null, takeback })));
    } else {
      entity$ = of({ activity: null, takeback: null });
    }

    return forkJoin({ users: this.session.getAllUsers(), entity: entity$ }).pipe(
      map(({ users, entity }) => ({
        result: { users, activity: entity.activity, takeback: entity.takeback, memberId },
        error: null
      })),
      catchError((error: unknown) => of({ result: null, error: ApiError.from(error) }))
    );
  }

  private finishLoad(outcome: { result: LoadResult | null; error: ApiError | null }): void {
    this.loading = false;
    if (!outcome.result) {
      this.loadError = outcome.error;
      return;
    }

    const { users, activity, takeback, memberId } = outcome.result;
    this.users = users;
    this.isEdit = activity !== null;
    this.form.controls.dueDate.setValidators(this.isEdit ? [] : [minDate(todayIso)]);

    if (activity) {
      this.applyActivity(activity);
      return;
    }

    this.activity = null;
    this.takebackId = takeback ? takeback.takebackId : null;
    this.linkedTakebackNumber = takeback ? takeback.takebackNumber : null;
    this.linkedMemberName = takeback ? takeback.memberName : null;
    this.memberLabel = memberId !== null ? `Member #${memberId}` : null;
    this.inactiveAssignee = null;
    this.form.reset({
      activityType: null,
      priority: ActivityPriority.Normal,
      status: ActivityStatus.Open,
      subject: '',
      description: '',
      assignedToUserId: this.session.currentUserId,
      dueDate: '',
      memberId: takeback ? null : memberId
    });
  }

  /** Puts a loaded (or reloaded) activity on screen and remembers it, with its rowVersion. */
  private applyActivity(activity: Activity): void {
    this.activity = activity;
    this.isEdit = true;
    this.takebackId = activity.takebackId;
    this.linkedTakebackNumber = activity.takebackNumber;
    this.linkedMemberName = activity.memberName;
    this.memberLabel = activity.memberName ? `${activity.memberName} (${activity.memberNumber ?? activity.memberId})` : null;

    const assigneeId = activity.assignedToUserId;
    const isListed = assigneeId === null || this.users.some(user => user.userId === assigneeId);
    this.inactiveAssignee =
      isListed || assigneeId === null ? null : { userId: assigneeId, name: activity.assignedToName ?? `User #${assigneeId}` };

    this.form.reset({
      activityType: activity.activityType,
      priority: activity.priority,
      status: EDITABLE_ACTIVITY_STATUSES.includes(activity.status) ? activity.status : ActivityStatus.Open,
      subject: activity.subject,
      description: activity.description ?? '',
      assignedToUserId: assigneeId,
      dueDate: toDateInputValue(activity.dueDate),
      memberId: activity.memberId
    });
  }

  private buildRequest(): SaveActivityRequest | null {
    const value = this.form.getRawValue();
    if (value.activityType === null || value.priority === null) {
      return null;
    }
    return {
      activityId: this.activity ? this.activity.activityId : 0,
      memberId: this.takebackId !== null ? null : value.memberId,
      takebackId: this.takebackId,
      activityType: value.activityType,
      priority: value.priority,
      status: value.status,
      subject: value.subject.trim(),
      description: textOrNull(value.description),
      assignedToUserId: value.assignedToUserId,
      dueDate: toDatePayload(value.dueDate),
      rowVersion: this.activity ? this.activity.rowVersion : null
    };
  }

  private onSaved(saved: Activity): void {
    this.activity = saved;
    this.notifications.success(
      this.isEdit ? `Activity ${saved.activityNumber} was saved.` : `Activity ${saved.activityNumber} was created.`
    );
    void this.router.navigate(['/activities', saved.activityId], { replaceUrl: true });
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
