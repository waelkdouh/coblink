import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { DashboardService } from '../../core/services/dashboard.service';
import { LookupService } from '../../core/services/lookup.service';
import { SessionService } from '../../core/services/session.service';
import { ActivityPriority, ActivityStatus, TakebackStatus } from '../../models/enums';
import { DashboardSummary } from '../../models/models';
import { SharedModule } from '../../shared/shared.module';
import { addDaysIso, todayIso } from '../../shared/utils/date-utils';
import { buildActivityListItem, buildSummary, buildTakebackListItem } from '../../testing/test-data';
import {
  SessionStub,
  apiError,
  createDashboardServiceSpy,
  createLookupServiceSpy,
  createSessionServiceStub,
  overrideProperty
} from '../../testing/test-doubles';
import { click, query, queryAll, textOf } from '../../testing/test-helpers';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let dashboard: jasmine.SpyObj<DashboardService>;
  let session: SessionStub;

  function create(
    summary$: Observable<DashboardSummary> = of(buildSummary()),
    arrange: (sessionStub: SessionStub) => void = () => undefined
  ): void {
    dashboard = createDashboardServiceSpy();
    dashboard.getSummary.and.returnValue(summary$);
    session = createSessionServiceStub();
    arrange(session);
    TestBed.configureTestingModule({
      declarations: [DashboardComponent],
      imports: [SharedModule, RouterTestingModule],
      providers: [
        { provide: DashboardService, useValue: dashboard },
        { provide: SessionService, useValue: session.spy },
        { provide: LookupService, useValue: createLookupServiceSpy() }
      ]
    });
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  function kpi(id: string): HTMLAnchorElement {
    return query<HTMLAnchorElement>(fixture, `[data-kpi="${id}"]`) as HTMLAnchorElement;
  }

  function cellsOf(selector: string): string[] {
    return Array.from((query(fixture, selector) as HTMLElement).querySelectorAll('th, td')).map(cell =>
      (cell.textContent ?? '').trim()
    );
  }

  describe('loading', () => {
    it('requests the summary once when it opens', () => {
      create();

      expect(dashboard.getSummary).toHaveBeenCalledTimes(1);
    });

    it('shows a spinner until the summary has arrived', () => {
      const summary$ = new Subject<DashboardSummary>();
      create(summary$);
      expect(query(fixture, 'app-loading-spinner')).not.toBeNull();
      expect(queryAll(fixture, '[data-kpi]')).toEqual([]);

      summary$.next(buildSummary());
      fixture.detectChanges();

      expect(query(fixture, 'app-loading-spinner')).toBeNull();
      expect(queryAll(fixture, '[data-kpi]').length).toBe(7);
    });

    it('shows the problem and loads again when the user retries', () => {
      create(throwError(() => apiError('SERVER_ERROR', 'The dashboard is unavailable.')));
      expect(textOf(fixture, '[data-dashboard-error]')).toContain('The dashboard is unavailable.');
      expect(queryAll(fixture, '[data-kpi]')).toEqual([]);

      dashboard.getSummary.and.returnValue(of(buildSummary()));
      click(fixture, '[data-dashboard-error] button');

      expect(dashboard.getSummary).toHaveBeenCalledTimes(2);
      expect(query(fixture, '[data-dashboard-error]')).toBeNull();
      expect(queryAll(fixture, '[data-kpi]').length).toBe(7);
    });
  });

  describe('KPI cards', () => {
    beforeEach(() => create());

    it('shows the figures of the summary with their labels', () => {
      const cards = queryAll(fixture, '[data-kpi]').map(card => ({
        id: card.getAttribute('data-kpi'),
        value: (card.querySelector('[data-kpi-value]')?.textContent ?? '').trim(),
        label: (card.querySelector('.text-body-secondary')?.textContent ?? '').trim()
      }));

      expect(cards.map(card => [card.id, card.value])).toEqual([
        ['my-open-activities', '4'],
        ['my-overdue-activities', '1'],
        ['overdue-activities', '3'],
        ['due-this-week', '5'],
        ['pending-approval', '2'],
        ['active-takebacks', '6'],
        ['overdue-takebacks', '1']
      ]);
      expect(cards.map(card => card.label)).toEqual([
        'My open activities',
        'My overdue activities',
        'Overdue activities (all)',
        'Due this week',
        'Pending approval',
        'Active takebacks',
        'Overdue takebacks'
      ]);
    });

    it('deep-links the activity cards to lists filtered to the signed-in user', () => {
      expect(kpi('my-open-activities').getAttribute('href')).toBe('/activities?assignedToUserId=1&openOnly=true');
      expect(kpi('my-overdue-activities').getAttribute('href')).toBe('/activities?assignedToUserId=1&overdueOnly=true');
    });

    it('deep-links the overdue activities card to the overdue list of everybody', () => {
      expect(kpi('overdue-activities').getAttribute('href')).toBe('/activities?overdueOnly=true');
    });

    it('deep-links the due this week card to a seven day window of open activities', () => {
      const today = todayIso();

      expect(kpi('due-this-week').getAttribute('href')).toBe(
        `/activities?dueFrom=${today}&dueTo=${addDaysIso(today, 7)}&openOnly=true`
      );
    });

    it('deep-links the takeback cards', () => {
      expect(kpi('pending-approval').getAttribute('href')).toBe(`/takebacks?status=${TakebackStatus.PendingApproval}`);
      expect(kpi('active-takebacks').getAttribute('href')).toBe('/takebacks');
      expect(kpi('overdue-takebacks').getAttribute('href')).toBe('/takebacks?overdueOnly=true');
    });

    it('offers the quick buttons for a new activity and a new takeback', () => {
      expect(query<HTMLAnchorElement>(fixture, '[data-quick-action="new-activity"]')?.getAttribute('href')).toBe('/activities/new');
      expect(query<HTMLAnchorElement>(fixture, '[data-quick-action="new-takeback"]')?.getAttribute('href')).toBe('/takebacks/new');
    });
  });

  describe('without a known user', () => {
    it('leaves the assignee out of the personal deep links', () => {
      create(of(buildSummary()), sessionStub => overrideProperty(sessionStub.spy, 'currentUserId', null));

      expect(kpi('my-open-activities').getAttribute('href')).toBe('/activities?openOnly=true');
      expect(kpi('my-overdue-activities').getAttribute('href')).toBe('/activities?overdueOnly=true');
    });
  });

  describe('money summary', () => {
    it('shows the total, recovered and outstanding amounts as dollars', () => {
      create();

      expect(textOf(fixture, '[data-money="total"]')).toBe('$10,000.00');
      expect(textOf(fixture, '[data-money="recovered"]')).toBe('$2,500.00');
      expect(textOf(fixture, '[data-money="outstanding"]')).toBe('$7,500.00');
    });

    it('draws the recovered share as a progress bar', () => {
      create();

      const bar = query(fixture, '[role="progressbar"]');
      expect(bar?.getAttribute('aria-valuenow')).toBe('25');
      expect(query(fixture, '[data-money-progress]')?.style.width).toBe('25%');
      expect(textOf(fixture, '[data-money-progress]')).toBe('25% recovered');
    });

    it('shows 0% when nothing has been claimed yet', () => {
      create(of(buildSummary({ totalTakebackAmount: 0, totalRecoveredAmount: 0, totalOutstandingAmount: 0 })));

      expect(textOf(fixture, '[data-money-progress]')).toBe('0% recovered');
    });

    it('never draws more than a full bar', () => {
      create(of(buildSummary({ totalTakebackAmount: 1000, totalRecoveredAmount: 1500, totalOutstandingAmount: 0 })));

      expect(query(fixture, '[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    });
  });

  describe('breakdown tables', () => {
    beforeEach(() => create());

    it('lists the activities by status with a total', () => {
      const rows = queryAll(fixture, '[data-breakdown="activities"] tbody tr').map(row =>
        Array.from(row.querySelectorAll('td')).map(cell => (cell.textContent ?? '').trim())
      );

      expect(rows).toEqual([
        ['Open', '8'],
        ['In Progress', '4']
      ]);
      expect(cellsOf('[data-breakdown="activities"] tfoot')).toEqual(['Total', '12']);
    });

    it('links every activity status to the list of that status', () => {
      const hrefs = queryAll<HTMLAnchorElement>(fixture, '[data-breakdown="activities"] tbody a').map(link =>
        link.getAttribute('href')
      );

      expect(hrefs).toEqual([
        `/activities?status=${ActivityStatus.Open}&openOnly=false`,
        `/activities?status=${ActivityStatus.InProgress}&openOnly=false`
      ]);
    });

    it('lists the takebacks by status with count, amount and total', () => {
      const rows = queryAll(fixture, '[data-breakdown="takebacks"] tbody tr').map(row =>
        Array.from(row.querySelectorAll('td')).map(cell => (cell.textContent ?? '').trim())
      );

      expect(rows).toEqual([
        ['Notice Sent', '3', '$6,000.00'],
        ['Partially Recovered', '3', '$4,000.00']
      ]);
      expect(cellsOf('[data-breakdown="takebacks"] tfoot')).toEqual(['Total', '6', '$10,000.00']);
    });
  });

  describe('breakdown tables with other data', () => {
    it('orders the statuses by their id however the server sent them', () => {
      create(
        of(
          buildSummary({
            activitiesByStatus: [
              { statusId: ActivityStatus.InProgress, count: 1, amount: 0 },
              { statusId: ActivityStatus.Open, count: 2, amount: 0 }
            ]
          })
        )
      );

      const first = queryAll(fixture, '[data-breakdown="activities"] tbody tr')[0];
      expect(first.textContent).toContain('Open');
    });

    it('says so when there is nothing to break down', () => {
      create(of(buildSummary({ activitiesByStatus: [], takebacksByStatus: [] })));

      expect(textOf(fixture, '[data-breakdown="activities"] tbody')).toBe('No activities yet.');
      expect(textOf(fixture, '[data-breakdown="takebacks"] tbody')).toBe('No takebacks yet.');
      expect(query(fixture, '[data-breakdown="activities"] tfoot')).toBeNull();
    });
  });

  describe('lists', () => {
    it('shows my upcoming activities with a link to each', () => {
      create(
        of(
          buildSummary({
            myUpcomingActivities: [
              buildActivityListItem({ activityId: 5, activityNumber: 'ACT-000005', subject: 'Verify other coverage', priority: ActivityPriority.High }),
              buildActivityListItem({ activityId: 6, activityNumber: 'ACT-000006', subject: 'Call the provider', isOverdue: true })
            ]
          })
        )
      );

      const items = queryAll(fixture, '[data-list="upcoming-activities"] li');
      expect(items.length).toBe(2);
      expect(items[0].querySelector('a')?.getAttribute('href')).toBe('/activities/5');
      expect(items[0].textContent).toContain('ACT-000005');
      expect(items[0].textContent).toContain('Verify other coverage');
      expect(items[0].textContent).toContain('Phone Call');
      expect(items[0].textContent).toContain('3/14/2025');
      expect(items[0].textContent).toContain('High');
      expect(items[0].textContent).not.toContain('Overdue');
      expect(items[1].textContent).toContain('Overdue');
    });

    it('links "View all" to my open activities', () => {
      create();

      expect(query<HTMLAnchorElement>(fixture, '[data-link="my-activities"]')?.getAttribute('href')).toBe(
        '/activities?assignedToUserId=1&openOnly=true'
      );
    });

    it('congratulates the user when there is nothing to do', () => {
      create(of(buildSummary({ myUpcomingActivities: [] })));

      expect(query(fixture, '[data-list="upcoming-activities"]')).toBeNull();
      expect(textOf(fixture, '[data-empty="upcoming-activities"]')).toContain('no open activities');
    });

    it('shows the recent takebacks with a link, amount, claim and status', () => {
      create(
        of(
          buildSummary({
            recentTakebacks: [
              buildTakebackListItem({ takebackId: 9, takebackNumber: 'TB-000009', claimNumber: 'CLM-9', takebackAmount: 1234.5, status: TakebackStatus.NoticeSent, isOverdue: true })
            ]
          })
        )
      );

      const item = query(fixture, '[data-list="recent-takebacks"] li') as HTMLElement;
      expect(item.querySelector('a')?.getAttribute('href')).toBe('/takebacks/9');
      expect(item.textContent).toContain('TB-000009');
      expect(item.textContent).toContain('$1,234.50');
      expect(item.textContent).toContain('Claim CLM-9');
      expect(item.textContent).toContain('Maria Lopez');
      expect(item.textContent).toContain('Notice Sent');
      expect(item.textContent).toContain('Overdue');
    });

    it('says so when no takeback exists yet', () => {
      create(of(buildSummary({ recentTakebacks: [] })));

      expect(query(fixture, '[data-list="recent-takebacks"]')).toBeNull();
      expect(textOf(fixture, '[data-empty="recent-takebacks"]')).toContain('No takebacks');
    });
  });
});
