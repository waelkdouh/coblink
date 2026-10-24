import { TestBed } from '@angular/core/testing';

import { LookupService } from '../../../core/services/lookup.service';
import { ActivityPriority, ActivityStatus, TakebackStatus } from '../../../models/enums';
import { createLookupServiceSpy } from '../../../testing/test-doubles';
import { SharedModule } from '../../shared.module';
import { StatusBadgeComponent, StatusBadgeKind } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  function render(kind: StatusBadgeKind, value: number | null): HTMLElement | null {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentInstance.kind = kind;
    fixture.componentInstance.value = value;
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.badge');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedModule],
      providers: [{ provide: LookupService, useValue: createLookupServiceSpy() }]
    });
  });

  it('shows the lookup name of an activity status with its contextual colour', () => {
    const badge = render('activityStatus', ActivityStatus.InProgress);

    expect(badge?.textContent?.trim()).toBe('In Progress');
    expect(badge?.classList).toContain('text-bg-info');
  });

  it('colours every activity status', () => {
    const expected: [ActivityStatus, string][] = [
      [ActivityStatus.Open, 'primary'],
      [ActivityStatus.InProgress, 'info'],
      [ActivityStatus.Completed, 'success'],
      [ActivityStatus.Cancelled, 'secondary']
    ];

    for (const [status, colour] of expected) {
      expect(render('activityStatus', status)?.classList).withContext(ActivityStatus[status]).toContain(`text-bg-${colour}`);
    }
  });

  it('colours every takeback status', () => {
    const expected: [TakebackStatus, string][] = [
      [TakebackStatus.Draft, 'secondary'],
      [TakebackStatus.PendingApproval, 'warning'],
      [TakebackStatus.Approved, 'info'],
      [TakebackStatus.Rejected, 'danger'],
      [TakebackStatus.NoticeSent, 'primary'],
      [TakebackStatus.PartiallyRecovered, 'info'],
      [TakebackStatus.Recovered, 'success'],
      [TakebackStatus.Disputed, 'warning'],
      [TakebackStatus.WrittenOff, 'dark'],
      [TakebackStatus.Cancelled, 'secondary']
    ];

    for (const [status, colour] of expected) {
      expect(render('takebackStatus', status)?.classList).withContext(TakebackStatus[status]).toContain(`text-bg-${colour}`);
    }
  });

  it('colours the priorities from calm to urgent', () => {
    const expected: [ActivityPriority, string][] = [
      [ActivityPriority.Low, 'secondary'],
      [ActivityPriority.Normal, 'info'],
      [ActivityPriority.High, 'warning'],
      [ActivityPriority.Urgent, 'danger']
    ];

    for (const [priority, colour] of expected) {
      expect(render('priority', priority)?.classList).withContext(ActivityPriority[priority]).toContain(`text-bg-${colour}`);
    }
  });

  it('shows the database name of the takeback status and of the priority', () => {
    expect(render('takebackStatus', TakebackStatus.PendingApproval)?.textContent?.trim()).toBe('Pending Approval');
    expect(render('priority', ActivityPriority.Urgent)?.textContent?.trim()).toBe('Urgent');
  });

  it('renders nothing without a value', () => {
    expect(render('activityStatus', null)).toBeNull();
  });

  it('renders a neutral badge for a value it does not know', () => {
    const badge = render('activityStatus', 99);

    expect(badge?.classList).toContain('text-bg-secondary');
    expect(badge?.textContent?.trim()).toBe('99');
  });
});
