import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, merge, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { ActivityService } from '../../../core/services/activity.service';
import { LookupService } from '../../../core/services/lookup.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SessionService } from '../../../core/services/session.service';
import { ApiError } from '../../../models/api';
import { ActivityPriority, ActivitySortKey, ActivityStatus, ActivityType, CLOSED_ACTIVITY_STATUSES } from '../../../models/enums';
import { ActivityListItem, AppUser, LookupItem, PagedResult } from '../../../models/models';
import { applyServerErrors } from '../../../shared/utils/form-utils';
import { PAGE_SIZES, toggleSort } from '../../../shared/utils/paging';
import { notLessThanControl } from '../../../shared/validators/app-validators';
import {
  ActivityListQuery,
  DEFAULT_ACTIVITY_QUERY,
  isActivitySortKey,
  parseActivityListQuery,
  serializeActivityListQuery,
  toActivitySearchRequest
} from './activity-list-query';

interface SearchOutcome {
  result: PagedResult<ActivityListItem> | null;
  error: ApiError | null;
}

@Component({
  selector: 'app-activity-list',
  templateUrl: './activity-list.component.html'
})
export class ActivityListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refresh$ = new Subject<void>();

  readonly pageSizes = PAGE_SIZES;

  readonly filterForm = this.fb.group({
    searchText: this.fb.nonNullable.control(''),
    status: this.fb.control<ActivityStatus | null>(null),
    activityType: this.fb.control<ActivityType | null>(null),
    priority: this.fb.control<ActivityPriority | null>(null),
    assignedToUserId: this.fb.control<number | null>(null),
    dueFrom: this.fb.nonNullable.control(''),
    dueTo: this.fb.nonNullable.control('', notLessThanControl('dueFrom', 'Due to cannot be before due from.')),
    openOnly: this.fb.nonNullable.control(true),
    overdueOnly: this.fb.nonNullable.control(false)
  });

  statuses: LookupItem[] = [];
  types: LookupItem[] = [];
  priorities: LookupItem[] = [];
  users: AppUser[] = [];

  /** The applied filters, page and sort order: always the state of the URL. */
  query: ActivityListQuery = DEFAULT_ACTIVITY_QUERY;
  result: PagedResult<ActivityListItem> | null = null;
  loading = true;
  alertMessages: string[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly activities: ActivityService,
    private readonly lookups: LookupService,
    private readonly session: SessionService,
    private readonly notifications: NotificationService
  ) {}

  get items(): ActivityListItem[] {
    return this.result ? this.result.items : [];
  }

  get isMine(): boolean {
    const me = this.session.currentUserId;
    return me !== null && this.filterForm.controls.assignedToUserId.value === me;
  }

  get resultSummary(): string {
    if (this.loading || !this.result) {
      return '';
    }
    return this.result.totalCount === 1 ? '1 activity found.' : `${this.result.totalCount} activities found.`;
  }

  ngOnInit(): void {
    this.statuses = this.lookups.getItems('activityStatuses');
    this.types = this.lookups.getItems('activityTypes');
    this.priorities = this.lookups.getItems('activityPriorities');

    this.session
      .getAllUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: users => (this.users = users),
        error: (error: unknown) => this.notifications.error(ApiError.from(error).message)
      });

    // A closed status can never match "open only", so unchecking it saves the user a confusing empty result.
    this.filterForm.controls.status.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(status => {
      if (status !== null && CLOSED_ACTIVITY_STATUSES.includes(status)) {
        this.filterForm.controls.openOnly.setValue(false);
      }
    });
    this.filterForm.controls.dueFrom.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.filterForm.controls.dueTo.updateValueAndValidity());

    // The URL is the single source of truth: every change of filters, page or sort is a navigation, which this
    // stream turns into a search. `refresh$` repeats the search when the user asks for it without changing the URL.
    merge(
      this.route.queryParamMap.pipe(map(params => parseActivityListQuery(params))),
      this.refresh$.pipe(map(() => this.query))
    )
      .pipe(
        tap(query => this.beginSearch(query)),
        switchMap(query => this.run(query)),
        takeUntil(this.destroy$)
      )
      .subscribe(outcome => this.finishSearch(outcome));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  search(): void {
    this.applyFilters();
  }

  reset(): void {
    this.go(DEFAULT_ACTIVITY_QUERY);
  }

  retry(): void {
    this.refresh$.next();
  }

  toggleAssignedToMe(): void {
    const me = this.session.currentUserId;
    if (me !== null) {
      this.applyFilters({ assignedToUserId: this.isMine ? null : me });
    }
  }

  onSort(key: string): void {
    if (!isActivitySortKey(key)) {
      return;
    }
    const sort = toggleSort<ActivitySortKey>(this.query, key);
    this.go({ ...this.query, ...sort, pageNumber: 1 });
  }

  onPage(pageNumber: number): void {
    this.go({ ...this.query, pageNumber });
  }

  onPageSize(pageSize: number): void {
    this.go({ ...this.query, pageSize, pageNumber: 1 });
  }

  trackByActivity(_index: number, item: ActivityListItem): number {
    return item.activityId;
  }

  private applyFilters(overrides: Partial<ActivityListQuery> = {}): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }
    const form = this.filterForm.getRawValue();
    this.go({
      ...this.query,
      searchText: form.searchText.trim(),
      status: form.status,
      activityType: form.activityType,
      priority: form.priority,
      assignedToUserId: form.assignedToUserId,
      dueFrom: form.dueFrom,
      dueTo: form.dueTo,
      openOnly: form.openOnly,
      overdueOnly: form.overdueOnly,
      pageNumber: 1,
      ...overrides
    });
  }

  /** Navigates to the state; the same URL is not a navigation for the router, so that case searches again. */
  private go(query: ActivityListQuery, replaceUrl = false): void {
    const target = serializeActivityListQuery(query);
    if (JSON.stringify(target) === JSON.stringify(serializeActivityListQuery(this.query))) {
      this.refresh$.next();
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: target, replaceUrl });
  }

  private beginSearch(query: ActivityListQuery): void {
    this.query = query;
    this.filterForm.reset(
      {
        searchText: query.searchText,
        status: query.status,
        activityType: query.activityType,
        priority: query.priority,
        assignedToUserId: query.assignedToUserId,
        dueFrom: query.dueFrom,
        dueTo: query.dueTo,
        openOnly: query.openOnly,
        overdueOnly: query.overdueOnly
      },
      { emitEvent: false }
    );
    this.loading = true;
    this.alertMessages = [];
  }

  private run(query: ActivityListQuery): Observable<SearchOutcome> {
    return this.activities.search(toActivitySearchRequest(query)).pipe(
      map((result): SearchOutcome => ({ result, error: null })),
      catchError((error: unknown) => of<SearchOutcome>({ result: null, error: ApiError.from(error) }))
    );
  }

  private finishSearch(outcome: SearchOutcome): void {
    this.loading = false;
    this.result = outcome.result;

    if (outcome.error) {
      this.alertMessages = outcome.error.isValidation
        ? applyServerErrors(this.filterForm, outcome.error)
        : [outcome.error.message];
      return;
    }

    const result = outcome.result;
    if (result && result.items.length === 0 && result.totalCount > 0 && this.query.pageNumber > result.totalPages) {
      this.go({ ...this.query, pageNumber: Math.max(1, result.totalPages) }, true);
    }
  }
}
