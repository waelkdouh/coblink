import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness, RouterTestingModule } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { ActivityService } from '../../../core/services/activity.service';
import { LookupService } from '../../../core/services/lookup.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SessionService } from '../../../core/services/session.service';
import { ActivityPriority, ActivityStatus, ActivityType } from '../../../models/enums';
import { ActivityListItem, ActivitySearchRequest, PagedResult } from '../../../models/models';
import { SharedModule } from '../../../shared/shared.module';
import { buildActivityListItem, buildPage } from '../../../testing/test-data';
import {
  SessionStub,
  apiError,
  createActivityServiceSpy,
  createLookupServiceSpy,
  createNotificationServiceSpy,
  createSessionServiceStub
} from '../../../testing/test-doubles';
import { click, query, queryAll, selectOption, setChecked, setValue, textOf } from '../../../testing/test-helpers';
import { ActivityListComponent } from './activity-list.component';

const DEFAULT_REQUEST: ActivitySearchRequest = {
  pageNumber: 1,
  pageSize: 20,
  sortBy: 'dueDate',
  sortDescending: false,
  searchText: null,
  status: null,
  openOnly: true,
  activityType: null,
  priority: null,
  assignedToUserId: null,
  dueFrom: null,
  dueTo: null,
  overdueOnly: false
};

describe('ActivityListComponent', () => {
  let activities: jasmine.SpyObj<ActivityService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let session: SessionStub;
  let harness: RouterTestingHarness;
  let fixture: ComponentFixture<unknown>;
  let component: ActivityListComponent;

  /** Search results as the API answers them: the page and page size of the request, `totalCount` rows overall. */
  function answerWith(items: ActivityListItem[], totalCount = items.length): void {
    activities.search.and.callFake((request: ActivitySearchRequest): Observable<PagedResult<ActivityListItem>> =>
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

  async function open(url = '/activities'): Promise<void> {
    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl(url, ActivityListComponent);
    fixture = harness.fixture;
  }

  /** Waits for the navigation a click started and renders the result. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function lastRequest(): ActivitySearchRequest {
    return activities.search.calls.mostRecent().args[0];
  }

  function currentUrl(): string {
    return TestBed.inject(Router).url;
  }

  function rows(): HTMLElement[] {
    return queryAll(fixture, '[data-activity-row]');
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
    activities = createActivityServiceSpy();
    notifications = createNotificationServiceSpy();
    session = createSessionServiceStub();
    answerWith([buildActivityListItem()]);

    TestBed.configureTestingModule({
      declarations: [ActivityListComponent],
      imports: [SharedModule, RouterTestingModule.withRoutes([{ path: 'activities', component: ActivityListComponent }])],
      providers: [
        { provide: ActivityService, useValue: activities },
        { provide: LookupService, useValue: createLookupServiceSpy() },
        { provide: SessionService, useValue: session.spy },
        { provide: NotificationService, useValue: notifications }
      ]
    });
  });

  describe('first load', () => {
    it('searches for the open activities by due date', async () => {
      await open();

      expect(activities.search).toHaveBeenCalledTimes(1);
      expect(lastRequest()).toEqual(DEFAULT_REQUEST);
    });

    it('shows a spinner until the search has finished', async () => {
      const results = new Subject<PagedResult<ActivityListItem>>();
      activities.search.and.returnValue(results);
      await open();
      expect(query(fixture, 'app-loading-spinner')).not.toBeNull();
      expect(query(fixture, '[data-activity-table]')).toBeNull();

      results.next(buildPage([buildActivityListItem()]));
      fixture.detectChanges();

      expect(query(fixture, 'app-loading-spinner')).toBeNull();
      expect(rows().length).toBe(1);
    });

    it('shows one row per activity with links to the activity and its takeback', async () => {
      answerWith([
        buildActivityListItem({
          activityId: 5,
          activityNumber: 'ACT-000005',
          subject: 'Verify other coverage',
          takebackId: 7,
          takebackNumber: 'TB-000007'
        })
      ]);
      await open();

      expect(cells(rows()[0])).toEqual([
        'ACT-000005',
        'Verify other coverage',
        'Phone Call',
        'Open',
        'Normal',
        'Maria Lopez (M-0011)',
        'TB-000007',
        'Ana Analyst',
        '3/14/2025'
      ]);
      const links = Array.from(rows()[0].querySelectorAll('a')).map(link => link.getAttribute('href'));
      expect(links).toEqual(['/activities/5', '/takebacks/7']);
    });

    it('shows dashes for a missing member, takeback and due date and Unassigned for a missing assignee', async () => {
      answerWith([
        buildActivityListItem({
          memberId: null,
          memberNumber: null,
          memberName: null,
          takebackId: null,
          takebackNumber: null,
          assignedToUserId: null,
          assignedToName: null,
          dueDate: null
        })
      ]);
      await open();

      const [, , , , , member, takeback, assignee, due] = cells(rows()[0]);
      expect([member, takeback, assignee, due]).toEqual(['—', '—', 'Unassigned', '—']);
    });

    it('flags only the overdue activities with the red badge', async () => {
      answerWith([
        buildActivityListItem({ activityId: 1, activityNumber: 'ACT-1', isOverdue: true }),
        buildActivityListItem({ activityId: 2, activityNumber: 'ACT-2', isOverdue: false })
      ]);
      await open();

      expect(rows()[0].querySelector('.badge.text-bg-danger')?.textContent).toContain('Overdue');
      expect(rows()[1].querySelector('.badge.text-bg-danger')).toBeNull();
    });

    it('uses the badge colours of the status and the priority', async () => {
      answerWith([buildActivityListItem({ status: ActivityStatus.Completed, priority: ActivityPriority.Urgent })]);
      await open();

      const badges = Array.from(rows()[0].querySelectorAll('.badge')).map(badge => [badge.textContent?.trim(), badge.className]);
      expect(badges[0][1]).toContain('text-bg-success');
      expect(badges[1][1]).toContain('text-bg-danger');
    });

    it('announces how many activities were found', async () => {
      answerWith([buildActivityListItem()], 1);
      await open();
      expect(textOf(fixture, '[data-result-summary]')).toBe('1 activity found.');

      answerWith([buildActivityListItem(), buildActivityListItem({ activityId: 6 })], 2);
      await harness.navigateByUrl('/activities?overdueOnly=true');

      expect(textOf(fixture, '[data-result-summary]')).toBe('2 activities found.');
    });

    it('shows an empty state with a way to create an activity when nothing matches', async () => {
      answerWith([], 0);
      await open();

      expect(textOf(fixture, '[data-empty-state]')).toContain('No activities found');
      expect(query(fixture, '[data-empty-state] a')?.getAttribute('href')).toBe('/activities/new');
      expect(query(fixture, '[data-activity-table]')).toBeNull();
      expect(query(fixture, 'app-pager')).toBeNull();
    });

    it('shows the problem of a failed search and repeats the search on request', async () => {
      activities.search.and.returnValues(
        throwError(() => apiError('SERVER_ERROR', 'The activity service is unavailable.')),
        of(buildPage([buildActivityListItem()]))
      );
      await open();
      expect(textOf(fixture, '[data-form-alert]')).toContain('The activity service is unavailable.');
      expect(query(fixture, '[data-activity-table]')).toBeNull();

      click(fixture, '[data-action="retry"]');

      expect(activities.search).toHaveBeenCalledTimes(2);
      expect(query(fixture, '[data-form-alert]')).toBeNull();
      expect(rows().length).toBe(1);
    });

    it('links to the form for a new activity', async () => {
      await open();

      expect(query<HTMLAnchorElement>(fixture, '[data-action="new-activity"]')?.getAttribute('href')).toBe('/activities/new');
    });
  });

  describe('filter bar', () => {
    it('offers the statuses, types and priorities of the lookups and the active users', async () => {
      await open();
      const labels = (selector: string): (string | undefined)[] =>
        queryAll<HTMLOptionElement>(fixture, `${selector} option`).map(option => option.textContent?.trim());

      expect(labels('#filter-status')).toEqual(['All', 'Open', 'In Progress', 'Completed', 'Cancelled']);
      expect(labels('#filter-priority')).toEqual(['All', 'Low', 'Normal', 'High', 'Urgent']);
      expect(labels('#filter-type').slice(0, 3)).toEqual(['All', 'Phone Call', 'Email']);
      expect(labels('#filter-assignee')).toEqual(['Anyone', 'Ana Analyst', 'Sam Supervisor', 'Ada Admin']);
    });

    it('starts with "Open only" ticked and "Overdue only" cleared', async () => {
      await open();

      expect(query<HTMLInputElement>(fixture, '#filter-open-only')?.checked).toBeTrue();
      expect(query<HTMLInputElement>(fixture, '#filter-overdue-only')?.checked).toBeFalse();
    });

    it('labels every filter control', async () => {
      await open();
      const ids = ['filter-search', 'filter-status', 'filter-type', 'filter-priority', 'filter-assignee', 'filter-due-from', 'filter-due-to', 'filter-open-only', 'filter-overdue-only'];

      for (const id of ids) {
        expect(query(fixture, `label[for="${id}"]`)).withContext(id).not.toBeNull();
      }
    });

    it('sends the chosen filters as the search request and keeps them in the URL', async () => {
      await open();

      setValue(fixture, '#filter-search', '  maria ');
      selectOption(fixture, '#filter-status', 'In Progress');
      selectOption(fixture, '#filter-type', 'Phone Call');
      selectOption(fixture, '#filter-priority', 'High');
      selectOption(fixture, '#filter-assignee', 'Sam Supervisor');
      setValue(fixture, '#filter-due-from', '2025-03-01');
      setValue(fixture, '#filter-due-to', '2025-03-31');
      setChecked(fixture, '#filter-open-only', false);
      setChecked(fixture, '#filter-overdue-only', true);
      click(fixture, '[data-action="search"]');
      await settle();

      expect(lastRequest()).toEqual({
        ...DEFAULT_REQUEST,
        searchText: 'maria',
        status: ActivityStatus.InProgress,
        activityType: ActivityType.PhoneCall,
        priority: ActivityPriority.High,
        assignedToUserId: 2,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        openOnly: false,
        overdueOnly: true
      });
      expect(currentUrl()).toBe(
        '/activities?searchText=maria&status=2&activityType=1&priority=3&assignedToUserId=2&dueFrom=2025-03-01&dueTo=2025-03-31&openOnly=false&overdueOnly=true'
      );
    });

    it('searches again when Search is pressed without a change', async () => {
      await open();

      click(fixture, '[data-action="search"]');
      await settle();

      expect(activities.search).toHaveBeenCalledTimes(2);
      expect(currentUrl()).toBe('/activities');
    });

    it('restores the filters, page and sort order from the URL', async () => {
      await open(
        '/activities?searchText=maria&status=2&activityType=1&priority=3&assignedToUserId=2&dueFrom=2025-03-01&dueTo=2025-03-31&openOnly=false&overdueOnly=true&pageNumber=2&pageSize=50&sortBy=subject&sortDescending=true'
      );

      expect(lastRequest()).toEqual({
        pageNumber: 2,
        pageSize: 50,
        sortBy: 'subject',
        sortDescending: true,
        searchText: 'maria',
        status: ActivityStatus.InProgress,
        openOnly: false,
        activityType: ActivityType.PhoneCall,
        priority: ActivityPriority.High,
        assignedToUserId: 2,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        overdueOnly: true
      });
      expect(component.filterForm.getRawValue()).toEqual({
        searchText: 'maria',
        status: ActivityStatus.InProgress,
        activityType: ActivityType.PhoneCall,
        priority: ActivityPriority.High,
        assignedToUserId: 2,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        openOnly: false,
        overdueOnly: true
      });
      expect(query<HTMLInputElement>(fixture, '#filter-search')?.value).toBe('maria');
      expect(query<HTMLInputElement>(fixture, '#filter-open-only')?.checked).toBeFalse();
      expect(query<HTMLInputElement>(fixture, '#filter-overdue-only')?.checked).toBeTrue();
    });

    it('applies the filters of a dashboard deep link', async () => {
      await open('/activities?assignedToUserId=1&overdueOnly=true');

      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, assignedToUserId: 1, overdueOnly: true });
    });

    it('goes back to the defaults when Reset is pressed', async () => {
      await open('/activities?searchText=maria&status=2&overdueOnly=true&pageNumber=2&sortBy=subject');

      click(fixture, '[data-action="reset"]');
      await settle();

      expect(lastRequest()).toEqual(DEFAULT_REQUEST);
      expect(currentUrl()).toBe('/activities');
      expect(query<HTMLInputElement>(fixture, '#filter-search')?.value).toBe('');
    });

    it('unticks "Open only" when a closed status is chosen, because the two can never match', async () => {
      await open();

      selectOption(fixture, '#filter-status', 'Completed');

      expect(query<HTMLInputElement>(fixture, '#filter-open-only')?.checked).toBeFalse();
    });

    it('does not search while the due dates are in the wrong order and explains why', async () => {
      await open();

      setValue(fixture, '#filter-due-from', '2025-03-10');
      setValue(fixture, '#filter-due-to', '2025-03-01');
      click(fixture, '[data-action="search"]');
      await settle();

      expect(activities.search).toHaveBeenCalledTimes(1);
      expect(textOf(fixture, '[data-filter-form]')).toContain('Due to cannot be before due from.');
    });

    it('filters on the signed-in user with the "Assigned to me" shortcut and toggles it off again', async () => {
      await open();
      const button = (): HTMLElement => query(fixture, '[data-action="assigned-to-me"]') as HTMLElement;
      expect(button().getAttribute('aria-pressed')).toBe('false');

      click(fixture, '[data-action="assigned-to-me"]');
      await settle();
      expect(lastRequest().assignedToUserId).toBe(1);
      expect(currentUrl()).toBe('/activities?assignedToUserId=1');
      expect(button().getAttribute('aria-pressed')).toBe('true');

      click(fixture, '[data-action="assigned-to-me"]');
      await settle();
      expect(lastRequest().assignedToUserId).toBeNull();
      expect(currentUrl()).toBe('/activities');
      expect(button().getAttribute('aria-pressed')).toBe('false');
    });

    it('tells the user when the list of assignees cannot be loaded', async () => {
      session.spy.getAllUsers.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The user list is unavailable.')));
      await open();

      expect(notifications.error).toHaveBeenCalledWith('The user list is unavailable.');
    });
  });

  describe('sorting', () => {
    it('marks the due date column as the sorted one at first', async () => {
      await open();

      expect(sortHeader('Due date').getAttribute('aria-sort')).toBe('ascending');
      expect(sortHeader('Subject').getAttribute('aria-sort')).toBe('none');
    });

    it('sorts a column ascending on the first click and descending on the second', async () => {
      await open();

      sortButton('Subject').click();
      await settle();
      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, sortBy: 'subject', sortDescending: false });
      expect(currentUrl()).toBe('/activities?sortBy=subject');
      expect(sortHeader('Subject').getAttribute('aria-sort')).toBe('ascending');
      expect(sortHeader('Due date').getAttribute('aria-sort')).toBe('none');

      sortButton('Subject').click();
      await settle();
      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, sortBy: 'subject', sortDescending: true });
      expect(currentUrl()).toBe('/activities?sortBy=subject&sortDescending=true');
      expect(sortHeader('Subject').getAttribute('aria-sort')).toBe('descending');
    });

    it('reverses the default order when the due date header is clicked', async () => {
      await open();

      sortButton('Due date').click();
      await settle();

      expect(lastRequest()).toEqual({ ...DEFAULT_REQUEST, sortBy: 'dueDate', sortDescending: true });
    });

    it('sends the sort keys of the API for every sortable column', async () => {
      await open();
      const expected: Record<string, string> = {
        Number: 'activityNumber',
        Subject: 'subject',
        Type: 'activityType',
        Status: 'status',
        Priority: 'priority',
        Member: 'memberName',
        Assignee: 'assignedToName',
        'Due date': 'dueDate'
      };

      for (const [label, key] of Object.entries(expected)) {
        sortButton(label).click();
        await settle();
        expect(lastRequest().sortBy).withContext(label).toBe(key);
      }
    });

    it('returns to the first page when the sort order changes', async () => {
      answerWith([buildActivityListItem()], 45);
      await open('/activities?pageNumber=3');

      sortButton('Subject').click();
      await settle();

      expect(lastRequest().pageNumber).toBe(1);
      expect(currentUrl()).toBe('/activities?sortBy=subject');
    });
  });

  describe('paging', () => {
    beforeEach(() => answerWith([buildActivityListItem(), buildActivityListItem({ activityId: 6, activityNumber: 'ACT-000006' })], 45));

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
      expect(currentUrl()).toBe('/activities?pageNumber=2');
      expect(textOf(fixture, 'app-pager [role="status"]')).toBe('Showing 21-40 of 45');
    });

    it('jumps to the last page and back to the first', async () => {
      await open();

      click(fixture, '[data-pager="last"]');
      await settle();
      expect(lastRequest().pageNumber).toBe(3);
      expect(textOf(fixture, 'app-pager [role="status"]')).toBe('Showing 41-45 of 45');

      click(fixture, '[data-pager="first"]');
      await settle();
      expect(lastRequest().pageNumber).toBe(1);
      expect(currentUrl()).toBe('/activities');
    });

    it('changes the page size and starts again on the first page', async () => {
      await open('/activities?pageNumber=2');

      setValue(fixture, 'app-pager select', '50');
      await settle();

      expect(lastRequest().pageSize).toBe(50);
      expect(lastRequest().pageNumber).toBe(1);
      expect(currentUrl()).toBe('/activities?pageSize=50');
    });

    it('offers the page sizes 10, 20, 50 and 100', async () => {
      await open();

      const sizes = queryAll<HTMLOptionElement>(fixture, 'app-pager option').map(option => option.value);

      expect(sizes).toEqual(['10', '20', '50', '100']);
    });

    it('steps back to the last page when the requested page lies behind the end of the result', async () => {
      activities.search.and.callFake(request =>
        of(
          request.pageNumber > 3
            ? buildPage<ActivityListItem>([], { pageNumber: request.pageNumber, totalCount: 45, totalPages: 3 })
            : buildPage([buildActivityListItem()], { pageNumber: request.pageNumber, totalCount: 45, totalPages: 3 })
        )
      );

      await open('/activities?pageNumber=9');
      await settle();

      expect(lastRequest().pageNumber).toBe(3);
      expect(currentUrl()).toBe('/activities?pageNumber=3');
    });

    it('disables the pager while a search is running', async () => {
      const next = new Subject<PagedResult<ActivityListItem>>();
      await open();
      activities.search.and.returnValue(next);

      click(fixture, '[data-pager="next"]');
      await settle();

      expect(query<HTMLButtonElement>(fixture, '[data-pager="next"]')?.disabled).toBeTrue();
      expect(query<HTMLButtonElement>(fixture, '[data-action="search"]')?.disabled).toBeTrue();
    });
  });
});
