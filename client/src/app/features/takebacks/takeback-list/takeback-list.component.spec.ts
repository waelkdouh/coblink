import { formatDate } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness, RouterTestingModule } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { LookupService } from '../../../core/services/lookup.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SessionService } from '../../../core/services/session.service';
import { TakebackService } from '../../../core/services/takeback.service';
import { TakebackReason, TakebackStatus } from '../../../models/enums';
import { PagedResult, TakebackListItem, TakebackSearchRequest } from '../../../models/models';
import { SharedModule } from '../../../shared/shared.module';
import { TEST_TIMESTAMP, buildPage, buildTakebackListItem } from '../../../testing/test-data';
import {
  SessionStub,
  apiError,
  createLookupServiceSpy,
  createNotificationServiceSpy,
  createSessionServiceStub,
  createTakebackServiceSpy
} from '../../../testing/test-doubles';
import { click, query, queryAll, selectOption, setChecked, setValue, textOf } from '../../../testing/test-helpers';
import { TakebackListComponent } from './takeback-list.component';

const DEFAULT_REQUEST: TakebackSearchRequest = {
  pageNumber: 1,
  pageSize: 20,
  sortBy: 'createdDate',
  sortDescending: true,
  searchText: null,
  status: null,
  reason: null,
  createdByUserId: null,
  minAmount: null,
  maxAmount: null,
  dueFrom: null,
  dueTo: null,
  overdueOnly: false
};

describe('TakebackListComponent', () => {
  let takebacks: jasmine.SpyObj<TakebackService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let session: SessionStub;
  let harness: RouterTestingHarness;
  let fixture: ComponentFixture<unknown>;
  let component: TakebackListComponent;

  /** Search results as the API answers them: the page and page size of the request, `totalCount` rows overall. */
  function answerWith(items: TakebackListItem[], totalCount = items.length): void {
    takebacks.search.and.callFake((request: TakebackSearchRequest): Observable<PagedResult<TakebackListItem>> =>
      of(
        buildPage(items, {
          pageNumber: request.pageNumber,
          pageSize: request.pageSize,
          totalCount,
          totalPages: Math.max(1, Math.ceil(totalCount / request.pageSize))
        })
      )
    );
  }

  async function open(url = '/takebacks'): Promise<void> {
    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl(url, TakebackListComponent);
    fixture = harness.fixture;
  }

  /** Waits for the navigation a click started and renders the result. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function lastRequest(): TakebackSearchRequest {
    return takebacks.search.calls.mostRecent().args[0];
  }

  function currentUrl(): string {
    return TestBed.inject(Router).url;
  }

  function rows(): HTMLElement[] {
    return queryAll(fixture, '[data-takeback-row]');
  }

  function cells(row: HTMLElement): string[] {
    return Array.from(row.querySelectorAll('td')).map(cell => (cell.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  function sortButton(label: string): HTMLButtonElement {
    const header = queryAll<HTMLTableCellElement>(fixture, 'th[appSortHeader]').find(
      candidate => (candidate.textContent ?? '').trim() === label
    );
    return header?.querySelector('button') as HTMLButtonElement;
  }

  function sortHeader(label: string): HTMLElement {
    return sortButton(label).closest('th') as HTMLElement;
  }

  beforeEach(() => {
    takebacks = createTakebackServiceSpy();
    notifications = createNotificationServiceSpy();
    session = createSessionServiceStub();
    answerWith([buildTakebackListItem()]);

    TestBed.configureTestingModule({
      declarations: [TakebackListComponent],
      imports: [SharedModule, RouterTestingModule.withRoutes([{ path: 'takebacks', component: TakebackListComponent }])],
      providers: [
        { provide: TakebackService, useValue: takebacks },
        { provide: LookupService, useValue: createLookupServiceSpy() },
        { provide: SessionService, useValue: session.spy },
        { provide: NotificationService, useValue: notifications }
      ]
    });
  });

  describe('first load', () => {
    it('searches for the newest takebacks first', async () => {
      await open();

      expect(takebacks.search).toHaveBeenCalledTimes(1);
      expect(lastRequest()).toEqual(DEFAULT_REQUEST);
    });

    it('shows a spinner until the search has finished', async () => {
      const results = new Subject<PagedResult<TakebackListItem>>();
      takebacks.search.and.returnValue(results);
      await open();
      expect(query(fixture, 'app-loading-spinner')).not.toBeNull();
      expect(query(fixture, '[data-takeback-table]')).toBeNull();

      results.next(buildPage([buildTakebackListItem()]));
      fixture.detectChanges();

      expect(query(fixture, 'app-loading-spinner')).toBeNull();
      expect(rows().length).toBe(1);
    });

    it('shows one row per takeback with the lookup names, the money and a link to the takeback', async () => {
      await open();

      expect(cells(rows()[0])).toEqual([
        'TB-000007',
        'CLM-2025-0042',
        'Maria Lopez (M-0011)',
        'Riverside Clinic',
        'Duplicate Payment',
        'Draft',
        '$1,000.00',
        '$250.00',
        '$750.00',
        '4/14/2025',
        formatDate(TEST_TIMESTAMP, 'M/d/yyyy, h:mm a', 'en-US')
      ]);
      expect(rows()[0].querySelector('a')?.getAttribute('href')).toBe('/takebacks/7');
    });

    it('shows the due date as the calendar day, whatever the time zone', async () => {
      answerWith([buildTakebackListItem({ dueDate: '2025-01-01T00:00:00' })]);
      await open();

      expect(cells(rows()[0])[9]).toBe('1/1/2025');
    });

    it('shows a dash when there is no due date yet and leaves the member number out when it is missing', async () => {
      answerWith([buildTakebackListItem({ dueDate: null, memberNumber: '' })]);
      await open();

      const row = cells(rows()[0]);
      expect(row[9]).toBe('—');
      expect(row[2]).toBe('Maria Lopez');
    });

    it('flags only the overdue takebacks with the red badge', async () => {
      answerWith([
        buildTakebackListItem({ takebackId: 1, takebackNumber: 'TB-1', isOverdue: true }),
        buildTakebackListItem({ takebackId: 2, takebackNumber: 'TB-2', isOverdue: false })
      ]);
      await open();

      expect(rows()[0].querySelector('.badge.text-bg-danger')?.textContent).toContain('Overdue');
      expect(rows()[1].querySelector('.badge.text-bg-danger')).toBeNull();
    });

    it('colours the status badge by status', async () => {
      answerWith([
        buildTakebackListItem({ takebackId: 1, status: TakebackStatus.Recovered }),
        buildTakebackListItem({ takebackId: 2, status: TakebackStatus.Rejected })
      ]);
      await open();

      expect(rows()[0].querySelector('.badge')?.className).toContain('text-bg-success');
      expect(rows()[1].querySelector('.badge')?.className).toContain('text-bg-danger');
    });

    it('announces how many takebacks were found', async () => {
      answerWith([buildTakebackListItem()], 1);
      await open();
      expect(textOf(fixture, '[data-result-summary]')).toBe('1 takeback found.');

      answerWith([buildTakebackListItem(), buildTakebackListItem({ takebackId: 8 })], 2);
      await harness.navigateByUrl('/takebacks?overdueOnly=true');

      expect(textOf(fixture, '[data-result-summary]')).toBe('2 takebacks found.');
    });

    it('shows an empty state with a way to create a takeback when nothing matches', async () => {
      answerWith([], 0);
      await open();

      expect(textOf(fixture, '[data-empty-state]')).toContain('No takebacks found');
      expect(query(fixture, '[data-empty-state] a')?.getAttribute('href')).toBe('/takebacks/new');
      expect(query(fixture, '[data-takeback-table]')).toBeNull();
      expect(query(fixture, 'app-pager')).toBeNull();
    });

    it('shows the problem of a failed search and repeats the search on request', async () => {
      takebacks.search.and.returnValues(
        throwError(() => apiError('SERVER_ERROR', 'The takeback service is unavailable.')),
        of(buildPage([buildTakebackListItem()]))
      );
      await open();
      expect(textOf(fixture, '[data-form-alert]')).toContain('The takeback service is unavailable.');
      expect(query(fixture, '[data-takeback-table]')).toBeNull();

      click(fixture, '[data-action="retry"]');

      expect(takebacks.search).toHaveBeenCalledTimes(2);
      expect(query(fixture, '[data-form-alert]')).toBeNull();
      expect(rows().length).toBe(1);
    });

    it('links to the form for a new takeback', async () => {
      await open();

      expect(query<HTMLAnchorElement>(fixture, '[data-action="new-takeback"]')?.getAttribute('href')).toBe('/takebacks/new');
    });
  });

  describe('totals of the page', () => {
    it('adds up the rows that are visible', async () => {
      answerWith(
        [
          buildTakebackListItem({ takebackId: 1, takebackAmount: 1000, recoveredAmount: 250, outstandingAmount: 750 }),
          buildTakebackListItem({ takebackId: 2, takebackAmount: 500.5, recoveredAmount: 0, outstandingAmount: 500.5 })
        ],
        57
      );
      await open();

      expect(textOf(fixture, '[data-total="takebackAmount"]')).toBe('$1,500.50');
      expect(textOf(fixture, '[data-total="recoveredAmount"]')).toBe('$250.00');
      expect(textOf(fixture, '[data-total="outstandingAmount"]')).toBe('$1,250.50');
    });

    it('rounds the sums to cents, so floating point noise never shows', async () => {
      answerWith([
        buildTakebackListItem({ takebackId: 1, takebackAmount: 0.1, recoveredAmount: 0.1, outstandingAmount: 0 }),
        buildTakebackListItem({ takebackId: 2, takebackAmount: 0.2, recoveredAmount: 0.2, outstandingAmount: 0 })
      ]);
      await open();

      expect(component.totals).toEqual({ takebackAmount: 0.3, recoveredAmount: 0.3, outstandingAmount: 0 });
    });
  });

  describe('filter bar', () => {
    it('offers the statuses and reasons of the lookups', async () => {
      await open();
      const labels = (selector: string): (string | undefined)[] =>
        queryAll<HTMLOptionElement>(fixture, `${selector} option`).map(option => option.textContent?.trim());

      expect(labels('#filter-status')).toEqual([
        'All',
        'Draft',
        'Pending Approval',
        'Approved',
        'Rejected',
        'Notice Sent',
        'Partially Recovered',
        'Recovered',
        'Disputed',
        'Written Off',
        'Cancelled'
      ]);
      expect(labels('#filter-reason')).toEqual([
        'All',
        'Other Insurance Primary',
        'Medicare Primary',
        'Duplicate Payment',
        'Eligibility Terminated',
        'Third Party Liability',
        'Workers Compensation',
        'Provider Billing Error',
        'Other'
      ]);
    });

    it('starts with "Overdue only" cleared and "Created by me" not pressed', async () => {
      await open();

      expect(query<HTMLInputElement>(fixture, '#filter-overdue-only')?.checked).toBeFalse();
      expect(query(fixture, '[data-action="created-by-me"]')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('labels every filter control', async () => {
      await open();
      const ids = [
        'filter-search',
        'filter-status',
        'filter-reason',
        'filter-due-from',
        'filter-due-to',
        'filter-min-amount',
        'filter-max-amount',
        'filter-overdue-only'
      ];

      for (const id of ids) {
        expect(query(fixture, `label[for="${id}"]`)).withContext(id).not.toBeNull();
      }
    });

    it('sends the chosen filters as the search request and keeps them in the URL', async () => {
      await open();

      setValue(fixture, '#filter-search', '  CLM-2025 ');
      selectOption(fixture, '#filter-status', 'Notice Sent');
      selectOption(fixture, '#filter-reason', 'Medicare Primary');
      setValue(fixture, '#filter-due-from', '2025-03-01');
      setValue(fixture, '#filter-due-to', '2025-03-31');
      setValue(fixture, '#filter-min-amount', '100.5');
      setValue(fixture, '#filter-max-amount', '2500');
      setChecked(fixture, '#filter-overdue-only', true);
      click(fixture, '[data-action="search"]');
      await settle();

      expect(lastRequest()).toEqual({
        ...DEFAULT_REQUEST,
        searchText: 'CLM-2025',
        status: TakebackStatus.NoticeSent,
        reason: TakebackReason.MedicarePrimary,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        minAmount: 100.5,
        maxAmount: 2500,
        overdueOnly: true
      });
      expect(currentUrl()).toBe(
        '/takebacks?searchText=CLM-2025&status=5&reason=2&minAmount=100.5&maxAmount=2500&dueFrom=2025-03-01&dueTo=2025-03-31&overdueOnly=true'
      );
    });

    it('searches again when Search is pressed without a change', async () => {
      await open();

      click(fixture, '[data-action="search"]');
      await settle();

      expect(takebacks.search).toHaveBeenCalledTimes(2);
      expect(currentUrl()).toBe('/takebacks');
    });

    it('restores the filters, page and sort order from the URL', async () => {
      await open(
        '/takebacks?searchText=clinic&status=5&reason=1&createdByUserId=2&minAmount=10&maxAmount=900&dueFrom=2025-03-01&dueTo=2025-03-31&overdueOnly=true&pageNumber=2&pageSize=50&sortBy=takebackAmount&sortDescending=true'
      );

      expect(lastRequest()).toEqual({
        pageNumber: 2,
        pageSize: 50,
        sortBy: 'takebackAmount',
        sortDescending: true,
        searchText: 'clinic',
        status: TakebackStatus.NoticeSent,
        reason: TakebackReason.OtherInsurancePrimary,
        createdByUserId: 2,
        minAmount: 10,
        maxAmount: 900,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        overdueOnly: true
      });
      expect(component.filterForm.getRawValue()).toEqual({
        searchText: 'clinic',
        status: TakebackStatus.NoticeSent,
        reason: TakebackReason.OtherInsurancePrimary,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        minAmount: 10,
        maxAmount: 900,
        overdueOnly: true
      });
      expect(query<HTMLInputElement>(fixture, '#filter-search')?.value).toBe('clinic');
      expect(query<HTMLInputElement>(fixture, '#filter-min-amount')?.value).toBe('10');
      expect(query<HTMLInputElement>(fixture, '#filter-overdue-only')?.checked).toBeTrue();
    });

    it('applies the filters of the dashboard deep links', async () => {
      await open('/takebacks?overdueOnly=true');
      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, overdueOnly: true });

      await harness.navigateByUrl('/takebacks?status=2');
      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, status: TakebackStatus.PendingApproval });
    });

    it('goes back to the defaults when Reset is pressed', async () => {
      await open('/takebacks?searchText=clinic&status=5&minAmount=10&overdueOnly=true&pageNumber=2&sortBy=claimNumber');

      click(fixture, '[data-action="reset"]');
      await settle();

      expect(lastRequest()).toEqual(DEFAULT_REQUEST);
      expect(currentUrl()).toBe('/takebacks');
      expect(query<HTMLInputElement>(fixture, '#filter-search')?.value).toBe('');
      expect(query<HTMLInputElement>(fixture, '#filter-min-amount')?.value).toBe('');
    });

    it('does not search while the due dates are in the wrong order and explains why', async () => {
      await open();

      setValue(fixture, '#filter-due-from', '2025-03-10');
      setValue(fixture, '#filter-due-to', '2025-03-01');
      click(fixture, '[data-action="search"]');
      await settle();

      expect(takebacks.search).toHaveBeenCalledTimes(1);
      expect(textOf(fixture, '[data-filter-form]')).toContain('Due to cannot be before due from.');
    });

    it('does not search while the maximum amount is below the minimum amount and explains why', async () => {
      await open();

      setValue(fixture, '#filter-min-amount', '500');
      setValue(fixture, '#filter-max-amount', '100');
      click(fixture, '[data-action="search"]');
      await settle();

      expect(takebacks.search).toHaveBeenCalledTimes(1);
      expect(textOf(fixture, '#filter-max-amount-errors')).toBe('Maximum amount cannot be less than the minimum amount.');
    });

    it('accepts the maximum amount again once the minimum amount is lowered', async () => {
      await open();
      setValue(fixture, '#filter-min-amount', '500');
      setValue(fixture, '#filter-max-amount', '100');
      expect(component.filterForm.controls.maxAmount.invalid).toBeTrue();

      setValue(fixture, '#filter-min-amount', '50');

      expect(component.filterForm.controls.maxAmount.valid).toBeTrue();
    });

    it('rejects a negative amount', async () => {
      await open();

      setValue(fixture, '#filter-min-amount', '-5');
      click(fixture, '[data-action="search"]');
      await settle();

      expect(takebacks.search).toHaveBeenCalledTimes(1);
      expect(textOf(fixture, '#filter-min-amount-errors')).toBe('Min amount must be at least 0.');
    });

    it('treats an emptied amount as no limit', async () => {
      await open('/takebacks?minAmount=10&maxAmount=20');

      setValue(fixture, '#filter-min-amount', '');
      setValue(fixture, '#filter-max-amount', '');
      click(fixture, '[data-action="search"]');
      await settle();

      expect(lastRequest().minAmount).toBeNull();
      expect(lastRequest().maxAmount).toBeNull();
      expect(currentUrl()).toBe('/takebacks');
    });

    it('filters on the takebacks the signed-in user created with "Created by me" and toggles it off again', async () => {
      await open();
      const button = (): HTMLElement => query(fixture, '[data-action="created-by-me"]') as HTMLElement;

      click(fixture, '[data-action="created-by-me"]');
      await settle();
      expect(lastRequest().createdByUserId).toBe(1);
      expect(currentUrl()).toBe('/takebacks?createdByUserId=1');
      expect(button().getAttribute('aria-pressed')).toBe('true');

      click(fixture, '[data-action="created-by-me"]');
      await settle();
      expect(lastRequest().createdByUserId).toBeNull();
      expect(currentUrl()).toBe('/takebacks');
      expect(button().getAttribute('aria-pressed')).toBe('false');
    });

    it('keeps "Created by me" when the other filters are applied', async () => {
      await open('/takebacks?createdByUserId=1');

      selectOption(fixture, '#filter-status', 'Draft');
      click(fixture, '[data-action="search"]');
      await settle();

      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, createdByUserId: 1, status: TakebackStatus.Draft });
    });

    it('maps a validation error of the server onto the filter it names', async () => {
      const results = new Subject<PagedResult<TakebackListItem>>();
      takebacks.search.and.returnValue(results);
      await open();

      results.error(apiError('VALIDATION', 'One or more values are not valid.', [{ field: 'maxAmount', message: 'MaxAmount is too large.' }]));
      fixture.detectChanges();

      expect(component.filterForm.controls.maxAmount.errors).toEqual({ server: 'MaxAmount is too large.' });
      expect(textOf(fixture, '#filter-max-amount-errors')).toBe('MaxAmount is too large.');
      expect(query(fixture, '[data-form-alert]')).toBeNull();
    });

    it('shows validation errors that name no filter in the alert above the results', async () => {
      const results = new Subject<PagedResult<TakebackListItem>>();
      takebacks.search.and.returnValue(results);
      await open();

      results.error(apiError('VALIDATION', 'One or more values are not valid.', [{ field: 'sortBy', message: 'Unknown sort column.' }]));
      fixture.detectChanges();

      expect(textOf(fixture, '[data-form-alert]')).toContain('Unknown sort column.');
    });
  });

  describe('sorting', () => {
    it('marks the created column as the sorted one at first, newest first', async () => {
      await open();

      expect(sortHeader('Created').getAttribute('aria-sort')).toBe('descending');
      expect(sortHeader('Claim').getAttribute('aria-sort')).toBe('none');
    });

    it('sorts a column ascending on the first click and descending on the second', async () => {
      await open();

      sortButton('Claim').click();
      await settle();
      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, sortBy: 'claimNumber', sortDescending: false });
      expect(currentUrl()).toBe('/takebacks?sortBy=claimNumber');
      expect(sortHeader('Claim').getAttribute('aria-sort')).toBe('ascending');
      expect(sortHeader('Created').getAttribute('aria-sort')).toBe('none');

      sortButton('Claim').click();
      await settle();
      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, sortBy: 'claimNumber', sortDescending: true });
      expect(currentUrl()).toBe('/takebacks?sortBy=claimNumber&sortDescending=true');
      expect(sortHeader('Claim').getAttribute('aria-sort')).toBe('descending');
    });

    it('reverses the default order when the created header is clicked', async () => {
      await open();

      sortButton('Created').click();
      await settle();

      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, sortBy: 'createdDate', sortDescending: false });
      expect(currentUrl()).toBe('/takebacks?sortBy=createdDate');
    });

    it('sends the sort keys of the API for every sortable column', async () => {
      await open();
      const expected: Record<string, string> = {
        Takeback: 'takebackNumber',
        Claim: 'claimNumber',
        Member: 'memberName',
        Provider: 'providerName',
        Reason: 'reason',
        Status: 'status',
        'Takeback amount': 'takebackAmount',
        Recovered: 'recoveredAmount',
        Outstanding: 'outstandingAmount',
        'Due date': 'dueDate',
        Created: 'createdDate'
      };

      for (const [label, key] of Object.entries(expected)) {
        sortButton(label).click();
        await settle();
        expect(lastRequest().sortBy).withContext(label).toBe(key);
      }
    });

    it('returns to the first page when the sort order changes', async () => {
      answerWith([buildTakebackListItem()], 45);
      await open('/takebacks?pageNumber=3');

      sortButton('Claim').click();
      await settle();

      expect(lastRequest().pageNumber).toBe(1);
      expect(currentUrl()).toBe('/takebacks?sortBy=claimNumber');
    });

    it('ignores a sort key the API does not know', async () => {
      await open();
      const calls = takebacks.search.calls.count();

      component.onSort('activityNumber');
      await settle();

      expect(takebacks.search.calls.count()).toBe(calls);
    });
  });

  describe('paging', () => {
    beforeEach(() => answerWith([buildTakebackListItem(), buildTakebackListItem({ takebackId: 8, takebackNumber: 'TB-000008' })], 45));

    it('shows where the visible rows are in the result', async () => {
      await open();

      expect(textOf(fixture, 'app-pager [role="status"]')).toBe('Showing 1-20 of 45');
      expect(textOf(fixture, '[data-pager="position"]')).toBe('Page 1 of 3');
    });

    it('requests the next page and keeps it in the URL', async () => {
      await open();

      click(fixture, '[data-pager="next"]');
      await settle();

      expect(lastRequest().pageNumber).toBe(2);
      expect(currentUrl()).toBe('/takebacks?pageNumber=2');
      expect(textOf(fixture, 'app-pager [role="status"]')).toBe('Showing 21-40 of 45');
    });

    it('jumps to the last page and back to the first', async () => {
      await open();

      click(fixture, '[data-pager="last"]');
      await settle();
      expect(lastRequest().pageNumber).toBe(3);

      click(fixture, '[data-pager="first"]');
      await settle();
      expect(lastRequest().pageNumber).toBe(1);
      expect(currentUrl()).toBe('/takebacks');
    });

    it('changes the page size and starts again on the first page', async () => {
      await open('/takebacks?pageNumber=2');

      setValue(fixture, 'app-pager select', '50');
      await settle();

      expect(lastRequest().pageSize).toBe(50);
      expect(lastRequest().pageNumber).toBe(1);
      expect(currentUrl()).toBe('/takebacks?pageSize=50');
    });

    it('steps back to the last page when the requested page lies behind the end of the result', async () => {
      takebacks.search.and.callFake(request =>
        of(
          request.pageNumber > 3
            ? buildPage<TakebackListItem>([], { pageNumber: request.pageNumber, totalCount: 45, totalPages: 3 })
            : buildPage([buildTakebackListItem()], { pageNumber: request.pageNumber, totalCount: 45, totalPages: 3 })
        )
      );

      await open('/takebacks?pageNumber=9');
      await settle();

      expect(lastRequest().pageNumber).toBe(3);
      expect(currentUrl()).toBe('/takebacks?pageNumber=3');
    });

    it('disables the pager and the Search button while a search is running', async () => {
      const next = new Subject<PagedResult<TakebackListItem>>();
      await open();
      takebacks.search.and.returnValue(next);

      click(fixture, '[data-pager="next"]');
      await settle();

      expect(query<HTMLButtonElement>(fixture, '[data-pager="next"]')?.disabled).toBeTrue();
      expect(query<HTMLButtonElement>(fixture, '[data-action="search"]')?.disabled).toBeTrue();
    });
  });

  it('stops listening to the URL when the component is destroyed', async () => {
    await open();
    const calls = takebacks.search.calls.count();

    fixture.destroy();
    await TestBed.inject(Router).navigateByUrl('/takebacks?overdueOnly=true');

    expect(takebacks.search.calls.count()).toBe(calls);
  });
});
