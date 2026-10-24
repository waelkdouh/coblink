import { Component } from '@angular/core';
import { Params } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { DashboardService } from '../../core/services/dashboard.service';
import { SessionService } from '../../core/services/session.service';
import { ApiError } from '../../models/api';
import { TakebackStatus } from '../../models/enums';
import { DashboardSummary, StatusCount } from '../../models/models';
import { addDaysIso, todayIso } from '../../shared/utils/date-utils';

export type KpiTone = 'primary' | 'danger' | 'warning' | 'info' | 'success';

/** One tile of the KPI row; clicking it opens the list pre-filtered to the records behind the number. */
export interface KpiCard {
  id: string;
  label: string;
  value: number;
  link: '/activities' | '/takebacks';
  queryParams: Params;
  tone: KpiTone;
  icon: string;
}

export interface DashboardView {
  summary: DashboardSummary;
  kpis: KpiCard[];
  /** Query string of the activity list that shows the signed-in user's open activities. */
  myActivitiesQuery: Params;
  recoveredPercent: number;
  activityStatuses: StatusCount[];
  activityTotal: number;
  takebackStatuses: StatusCount[];
  takebackTotalCount: number;
  takebackTotalAmount: number;
}

export interface DashboardState {
  loading: boolean;
  view: DashboardView | null;
  error: ApiError | null;
}

const byStatus = (a: StatusCount, b: StatusCount): number => a.statusId - b.statusId;

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent {
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  /** Loading, failed or loaded: one stream, rendered with the async pipe (no manual subscription to clean up). */
  readonly state$: Observable<DashboardState> = this.reload$.pipe(
    switchMap(() =>
      this.dashboard.getSummary().pipe(
        map((summary): DashboardState => ({ loading: false, view: this.toView(summary), error: null })),
        catchError((error: unknown) => of<DashboardState>({ loading: false, view: null, error: ApiError.from(error) })),
        startWith<DashboardState>({ loading: true, view: null, error: null })
      )
    )
  );

  constructor(
    private readonly dashboard: DashboardService,
    private readonly session: SessionService
  ) {}

  reload(): void {
    this.reload$.next();
  }

  trackByKpi(_index: number, card: KpiCard): string {
    return card.id;
  }

  private toView(summary: DashboardSummary): DashboardView {
    const activityStatuses = [...summary.activitiesByStatus].sort(byStatus);
    const takebackStatuses = [...summary.takebacksByStatus].sort(byStatus);
    const total = summary.totalTakebackAmount;
    const percent = total > 0 ? Math.round((summary.totalRecoveredAmount / total) * 100) : 0;

    const me = this.session.currentUserId;
    const myActivitiesQuery: Params = me === null ? { openOnly: true } : { assignedToUserId: me, openOnly: true };

    return {
      summary,
      kpis: this.toKpis(summary, myActivitiesQuery),
      myActivitiesQuery,
      recoveredPercent: Math.min(100, Math.max(0, percent)),
      activityStatuses,
      activityTotal: activityStatuses.reduce((sum, row) => sum + row.count, 0),
      takebackStatuses,
      takebackTotalCount: takebackStatuses.reduce((sum, row) => sum + row.count, 0),
      takebackTotalAmount: takebackStatuses.reduce((sum, row) => sum + row.amount, 0)
    };
  }

  private toKpis(summary: DashboardSummary, myActivitiesQuery: Params): KpiCard[] {
    const me = this.session.currentUserId;
    const mine: Params = me === null ? {} : { assignedToUserId: me };
    const today = todayIso();

    return [
      {
        id: 'my-open-activities',
        label: 'My open activities',
        value: summary.myOpenActivities,
        link: '/activities',
        queryParams: myActivitiesQuery,
        tone: 'primary',
        icon: 'bi-person-check'
      },
      {
        id: 'my-overdue-activities',
        label: 'My overdue activities',
        value: summary.myOverdueActivities,
        link: '/activities',
        queryParams: { ...mine, overdueOnly: true },
        tone: 'danger',
        icon: 'bi-alarm'
      },
      {
        id: 'overdue-activities',
        label: 'Overdue activities (all)',
        value: summary.overdueActivities,
        link: '/activities',
        queryParams: { overdueOnly: true },
        tone: 'danger',
        icon: 'bi-exclamation-triangle'
      },
      {
        id: 'due-this-week',
        label: 'Due this week',
        value: summary.activitiesDueThisWeek,
        link: '/activities',
        queryParams: { dueFrom: today, dueTo: addDaysIso(today, 7), openOnly: true },
        tone: 'info',
        icon: 'bi-calendar-week'
      },
      {
        id: 'pending-approval',
        label: 'Pending approval',
        value: summary.takebacksPendingApproval,
        link: '/takebacks',
        queryParams: { status: TakebackStatus.PendingApproval },
        tone: 'warning',
        icon: 'bi-hourglass-split'
      },
      {
        id: 'active-takebacks',
        label: 'Active takebacks',
        value: summary.activeTakebacks,
        link: '/takebacks',
        queryParams: {},
        tone: 'primary',
        icon: 'bi-cash-stack'
      },
      {
        id: 'overdue-takebacks',
        label: 'Overdue takebacks',
        value: summary.overdueTakebacks,
        link: '/takebacks',
        queryParams: { overdueOnly: true },
        tone: 'danger',
        icon: 'bi-clock-history'
      }
    ];
  }
}
