import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, merge, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { LookupService } from '../../../core/services/lookup.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SessionService } from '../../../core/services/session.service';
import { TakebackService } from '../../../core/services/takeback.service';
import { ApiError } from '../../../models/api';
import { TakebackReason, TakebackSortKey, TakebackStatus } from '../../../models/enums';
import { LookupItem, PagedResult, TakebackListItem } from '../../../models/models';
import { applyServerErrors, numberOrNull } from '../../../shared/utils/form-utils';
import { PAGE_SIZES, toggleSort } from '../../../shared/utils/paging';
import { notLessThanControl } from '../../../shared/validators/app-validators';
import {
  DEFAULT_TAKEBACK_QUERY,
  TakebackListQuery,
  isTakebackSortKey,
  parseTakebackListQuery,
  serializeTakebackListQuery,
  toTakebackSearchRequest
} from './takeback-list-query';

interface SearchOutcome {
  result: PagedResult<TakebackListItem> | null;
  error: ApiError | null;
}

/** Sums of the rows on the visible page (not of the whole result). */
export interface PageTotals {
  takebackAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

@Component({
  selector: 'app-takeback-list',
  templateUrl: './takeback-list.component.html'
})
export class TakebackListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refresh$ = new Subject<void>();

  readonly pageSizes = PAGE_SIZES;

  readonly filterForm = this.fb.group({
    searchText: this.fb.nonNullable.control(''),
    status: this.fb.control<TakebackStatus | null>(null),
    reason: this.fb.control<TakebackReason | null>(null),
    dueFrom: this.fb.nonNullable.control(''),
    dueTo: this.fb.nonNullable.control('', notLessThanControl('dueFrom', 'Due to cannot be before due from.')),
    minAmount: this.fb.control<number | null>(null, Validators.min(0)),
    maxAmount: this.fb.control<number | null>(null, [
      Validators.min(0),
      notLessThanControl('minAmount', 'Maximum amount cannot be less than the minimum amount.')
    ]),
    overdueOnly: this.fb.nonNullable.control(false)
  });

  statuses: LookupItem[] = [];
  reasons: LookupItem[] = [];

  /** The applied filters, page and sort order: always the state of the URL. */
  query: TakebackListQuery = DEFAULT_TAKEBACK_QUERY;
  result: PagedResult<TakebackListItem> | null = null;
  totals: PageTotals = { takebackAmount: 0, recoveredAmount: 0, outstandingAmount: 0 };
  loading = true;
  alertMessages: string[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly takebacks: TakebackService,
    private readonly lookups: LookupService,
    private readonly session: SessionService,
    private readonly notifications: NotificationService
  ) {}

  get items(): TakebackListItem[] {
    return this.result ? this.result.items : [];
  }

  get isMine(): boolean {
    const me = this.session.currentUserId;
    return me !== null && this.query.createdByUserId === me;
  }

  get resultSummary(): string {
    if (this.loading || !this.result) {
      return '';
    }
    return this.result.totalCount === 1 ? '1 takeback found.' : `${this.result.totalCount} takebacks found.`;
  }

  ngOnInit(): void {
    this.statuses = this.lookups.getItems('takebackStatuses');
    this.reasons = this.lookups.getItems('takebackReasons');

    this.filterForm.controls.dueFrom.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.filterForm.controls.dueTo.updateValueAndValidity());
    this.filterForm.controls.minAmount.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.filterForm.controls.maxAmount.updateValueAndValidity());

    // The URL is the single source of truth: every change of filters, page or sort is a navigation, which this
    // stream turns into a search. `refresh$` repeats the search when the user asks for it without changing the URL.
    merge(
      this.route.queryParamMap.pipe(map(params => parseTakebackListQuery(params))),
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
    this.go(DEFAULT_TAKEBACK_QUERY);
  }

  retry(): void {
    this.refresh$.next();
  }

  toggleCreatedByMe(): void {
    const me = this.session.currentUserId;
    if (me !== null) {
      this.applyFilters({ createdByUserId: this.isMine ? null : me });
    }
  }

  onSort(key: string): void {
    if (!isTakebackSortKey(key)) {
      return;
    }
    const sort = toggleSort<TakebackSortKey>(this.query, key);
    this.go({ ...this.query, ...sort, pageNumber: 1 });
  }

  onPage(pageNumber: number): void {
    this.go({ ...this.query, pageNumber });
  }

  onPageSize(pageSize: number): void {
    this.go({ ...this.query, pageSize, pageNumber: 1 });
  }

  trackByTakeback(_index: number, item: TakebackListItem): number {
    return item.takebackId;
  }

  private applyFilters(overrides: Partial<TakebackListQuery> = {}): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }
    const form = this.filterForm.getRawValue();
    this.go({
      ...this.query,
      searchText: form.searchText.trim(),
      status: form.status,
      reason: form.reason,
      minAmount: numberOrNull(form.minAmount),
      maxAmount: numberOrNull(form.maxAmount),
      dueFrom: form.dueFrom,
      dueTo: form.dueTo,
      overdueOnly: form.overdueOnly,
      pageNumber: 1,
      ...overrides
    });
  }

  /** Navigates to the state; the same URL is not a navigation for the router, so that case searches again. */
  private go(query: TakebackListQuery, replaceUrl = false): void {
    const target = serializeTakebackListQuery(query);
    if (JSON.stringify(target) === JSON.stringify(serializeTakebackListQuery(this.query))) {
      this.refresh$.next();
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: target, replaceUrl });
  }

  private beginSearch(query: TakebackListQuery): void {
    this.query = query;
    this.filterForm.reset(
      {
        searchText: query.searchText,
        status: query.status,
        reason: query.reason,
        dueFrom: query.dueFrom,
        dueTo: query.dueTo,
        minAmount: query.minAmount,
        maxAmount: query.maxAmount,
        overdueOnly: query.overdueOnly
      },
      { emitEvent: false }
    );
    this.loading = true;
    this.alertMessages = [];
  }

  private run(query: TakebackListQuery): Observable<SearchOutcome> {
    return this.takebacks.search(toTakebackSearchRequest(query)).pipe(
      map((result): SearchOutcome => ({ result, error: null })),
      catchError((error: unknown) => of<SearchOutcome>({ result: null, error: ApiError.from(error) }))
    );
  }

  private finishSearch(outcome: SearchOutcome): void {
    this.loading = false;
    this.result = outcome.result;
    this.totals = this.sum(this.items);

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

  private sum(items: TakebackListItem[]): PageTotals {
    return {
      takebackAmount: roundMoney(items.reduce((total, item) => total + item.takebackAmount, 0)),
      recoveredAmount: roundMoney(items.reduce((total, item) => total + item.recoveredAmount, 0)),
      outstandingAmount: roundMoney(items.reduce((total, item) => total + item.outstandingAmount, 0))
    };
  }
}
