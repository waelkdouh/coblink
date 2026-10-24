import { Component, Input } from '@angular/core';

import { ActivityPriority, ActivityStatus, TakebackStatus } from '../../../models/enums';
import { LookupListName } from '../../../models/models';

export type StatusBadgeKind = 'activityStatus' | 'takebackStatus' | 'priority';

const LIST_BY_KIND: Record<StatusBadgeKind, LookupListName> = {
  activityStatus: 'activityStatuses',
  takebackStatus: 'takebackStatuses',
  priority: 'activityPriorities'
};

/** Bootstrap contextual colour (text-bg-*) per value. */
const COLOUR_BY_KIND: Record<StatusBadgeKind, Record<number, string>> = {
  activityStatus: {
    [ActivityStatus.Open]: 'primary',
    [ActivityStatus.InProgress]: 'info',
    [ActivityStatus.Completed]: 'success',
    [ActivityStatus.Cancelled]: 'secondary'
  },
  takebackStatus: {
    [TakebackStatus.Draft]: 'secondary',
    [TakebackStatus.PendingApproval]: 'warning',
    [TakebackStatus.Approved]: 'info',
    [TakebackStatus.Rejected]: 'danger',
    [TakebackStatus.NoticeSent]: 'primary',
    [TakebackStatus.PartiallyRecovered]: 'info',
    [TakebackStatus.Recovered]: 'success',
    [TakebackStatus.Disputed]: 'warning',
    [TakebackStatus.WrittenOff]: 'dark',
    [TakebackStatus.Cancelled]: 'secondary'
  },
  priority: {
    [ActivityPriority.Low]: 'secondary',
    [ActivityPriority.Normal]: 'info',
    [ActivityPriority.High]: 'warning',
    [ActivityPriority.Urgent]: 'danger'
  }
};

/** Coloured label for an activity status, a takeback status or an activity priority. */
@Component({
  selector: 'app-status-badge',
  templateUrl: './status-badge.component.html'
})
export class StatusBadgeComponent {
  @Input() kind: StatusBadgeKind = 'activityStatus';
  @Input() value: number | null | undefined = null;

  get listName(): LookupListName {
    return LIST_BY_KIND[this.kind];
  }

  get colour(): string {
    const value = this.value;
    return (value === null || value === undefined ? undefined : COLOUR_BY_KIND[this.kind][value]) ?? 'secondary';
  }

  get badgeClass(): string {
    return `text-bg-${this.colour}`;
  }
}
