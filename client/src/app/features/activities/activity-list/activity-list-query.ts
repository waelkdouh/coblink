import { ParamMap, Params } from '@angular/router';

import {
  ActivityPriority,
  ActivitySortKey,
  ActivityStatus,
  ActivityType,
  DefaultSort,
  SortKeys
} from '../../../models/enums';
import { ActivitySearchRequest } from '../../../models/models';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../../../shared/utils/paging';
import {
  numericEnumValues,
  readBoolean,
  readChoice,
  readDate,
  readEnum,
  readInt,
  readPositiveInt,
  readText
} from '../../../shared/utils/query-utils';

/**
 * Everything the activity list shows is described by this object, and the object lives in the URL query string:
 * reloading the page or pressing Back restores the same filters, page and sort order.
 */
export interface ActivityListQuery {
  searchText: string;
  status: ActivityStatus | null;
  activityType: ActivityType | null;
  priority: ActivityPriority | null;
  assignedToUserId: number | null;
  /** `yyyy-MM-dd` or an empty string. */
  dueFrom: string;
  dueTo: string;
  openOnly: boolean;
  overdueOnly: boolean;
  pageNumber: number;
  pageSize: number;
  sortBy: ActivitySortKey;
  sortDescending: boolean;
}

export const DEFAULT_ACTIVITY_QUERY: ActivityListQuery = {
  searchText: '',
  status: null,
  activityType: null,
  priority: null,
  assignedToUserId: null,
  dueFrom: '',
  dueTo: '',
  openOnly: true,
  overdueOnly: false,
  pageNumber: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: DefaultSort.activity.sortBy,
  sortDescending: DefaultSort.activity.sortDescending
};

const SORT_KEYS: readonly ActivitySortKey[] = Object.values(SortKeys.activity);
const STATUSES = numericEnumValues<ActivityStatus>(ActivityStatus);
const TYPES = numericEnumValues<ActivityType>(ActivityType);
const PRIORITIES = numericEnumValues<ActivityPriority>(ActivityPriority);

export function isActivitySortKey(value: string): value is ActivitySortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

/** Reads a query string leniently: unknown or malformed values fall back to the defaults. */
export function parseActivityListQuery(params: ParamMap): ActivityListQuery {
  const defaults = DEFAULT_ACTIVITY_QUERY;
  const sortBy = readChoice(params, 'sortBy', SORT_KEYS);
  const pageSize = readPositiveInt(params, 'pageSize', defaults.pageSize);

  return {
    searchText: readText(params, 'searchText'),
    status: readEnum(params, 'status', STATUSES),
    activityType: readEnum(params, 'activityType', TYPES),
    priority: readEnum(params, 'priority', PRIORITIES),
    assignedToUserId: readInt(params, 'assignedToUserId'),
    dueFrom: readDate(params, 'dueFrom'),
    dueTo: readDate(params, 'dueTo'),
    openOnly: readBoolean(params, 'openOnly', defaults.openOnly),
    overdueOnly: readBoolean(params, 'overdueOnly', defaults.overdueOnly),
    pageNumber: readPositiveInt(params, 'pageNumber', defaults.pageNumber),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : defaults.pageSize,
    sortBy: sortBy ?? defaults.sortBy,
    sortDescending: params.has('sortDescending')
      ? readBoolean(params, 'sortDescending', false)
      : sortBy === null
        ? defaults.sortDescending
        : false
  };
}

/** Query string of a state; values that equal the defaults are left out to keep the URLs short. */
export function serializeActivityListQuery(query: ActivityListQuery): Params {
  const defaults = DEFAULT_ACTIVITY_QUERY;
  const params: Params = {};

  if (query.searchText) {
    params['searchText'] = query.searchText;
  }
  if (query.status !== null) {
    params['status'] = query.status;
  }
  if (query.activityType !== null) {
    params['activityType'] = query.activityType;
  }
  if (query.priority !== null) {
    params['priority'] = query.priority;
  }
  if (query.assignedToUserId !== null) {
    params['assignedToUserId'] = query.assignedToUserId;
  }
  if (query.dueFrom) {
    params['dueFrom'] = query.dueFrom;
  }
  if (query.dueTo) {
    params['dueTo'] = query.dueTo;
  }
  if (query.openOnly !== defaults.openOnly) {
    params['openOnly'] = query.openOnly;
  }
  if (query.overdueOnly !== defaults.overdueOnly) {
    params['overdueOnly'] = query.overdueOnly;
  }
  if (query.pageNumber !== defaults.pageNumber) {
    params['pageNumber'] = query.pageNumber;
  }
  if (query.pageSize !== defaults.pageSize) {
    params['pageSize'] = query.pageSize;
  }
  if (query.sortBy !== defaults.sortBy || query.sortDescending !== defaults.sortDescending) {
    params['sortBy'] = query.sortBy;
    if (query.sortDescending) {
      params['sortDescending'] = true;
    }
  }
  return params;
}

export function toActivitySearchRequest(query: ActivityListQuery): ActivitySearchRequest {
  return {
    pageNumber: query.pageNumber,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortDescending: query.sortDescending,
    searchText: query.searchText || null,
    status: query.status,
    openOnly: query.openOnly,
    activityType: query.activityType,
    priority: query.priority,
    assignedToUserId: query.assignedToUserId,
    dueFrom: query.dueFrom || null,
    dueTo: query.dueTo || null,
    overdueOnly: query.overdueOnly
  };
}
