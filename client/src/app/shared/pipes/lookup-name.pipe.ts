import { Pipe, PipeTransform } from '@angular/core';

import { LookupService } from '../../core/services/lookup.service';
import {
  ActivityPriority,
  ActivityStatus,
  ActivityType,
  RecoveryMethod,
  TakebackReason,
  TakebackStatus,
  UserRole
} from '../../models/enums';
import { LookupListName } from '../../models/models';

/** Numeric enums carry a reverse mapping (value -> member name), which is the fallback label. */
type EnumNames = { [value: number]: string };

const ENUM_BY_LOOKUP: Record<LookupListName, EnumNames> = {
  userRoles: UserRole,
  activityTypes: ActivityType,
  activityStatuses: ActivityStatus,
  activityPriorities: ActivityPriority,
  takebackReasons: TakebackReason,
  takebackStatuses: TakebackStatus,
  recoveryMethods: RecoveryMethod
};

/**
 * Display name of an enum value taken from the cached lookups (the names live in the database).
 * Falls back to the enum member name while the lookups are not loaded and to the number for unknown values.
 */
@Pipe({ name: 'lookupName' })
export class LookupNamePipe implements PipeTransform {
  constructor(private readonly lookups: LookupService) {}

  transform(id: number | null | undefined, list: LookupListName): string {
    if (id === null || id === undefined) {
      return '';
    }
    return this.lookups.getName(list, id) ?? ENUM_BY_LOOKUP[list][id] ?? String(id);
  }
}
