import { ParamMap, Params } from '@angular/router';

import { DefaultSort, SortKeys, TakebackReason, TakebackSortKey, TakebackStatus } from '../../../models/enums';
import { TakebackSearchRequest } from '../../../models/models';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../../../shared/utils/paging';
import {
  numericEnumValues,
  readBoolean,
  readChoice,
  readDate,
  readDecimal,
  readEnum,
  readInt,
  readPositiveInt,
  readText
} from '../../../shared/utils/query-utils';

/** Complete state of the takeback list; it is mirrored into the URL query string (see ActivityListQuery). */
export interface TakebackListQuery {
  searchText: string;
  status: TakebackStatus | null;
  reason: TakebackReason | null;
  createdByUserId: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  /** `yyyy-MM-dd` or an empty string. */
  dueFrom: string;
  dueTo: string;
  overdueOnly: boolean;
  pageNumber: number;
  pageSize: number;
  sortBy: TakebackSortKey;
  sortDescending: boolean;
}

export const DEFAULT_TAKEBACK_QUERY: TakebackListQuery = {
  searchText: '',
  status: null,
  reason: null,
  createdByUserId: null,
  minAmount: null,
  maxAmount: null,
  dueFrom: '',
  dueTo: '',
  overdueOnly: false,
  pageNumber: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: DefaultSort.takeback.sortBy,
  sortDescending: DefaultSort.takeback.sortDescending
};

const SORT_KEYS: readonly TakebackSortKey[] = Object.values(SortKeys.takeback);
const STATUSES = numericEnumValues<TakebackStatus>(TakebackStatus);
const REASONS = numericEnumValues<TakebackReason>(TakebackReason);

export function isTakebackSortKey(value: string): value is TakebackSortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export function parseTakebackListQuery(params: ParamMap): TakebackListQuery {
  const defaults = DEFAULT_TAKEBACK_QUERY;
  const sortBy = readChoice(params, 'sortBy', SORT_KEYS);
  const pageSize = readPositiveInt(params, 'pageSize', defaults.pageSize);

  return {
    searchText: readText(params, 'searchText'),
    status: readEnum(params, 'status', STATUSES),
    reason: readEnum(params, 'reason', REASONS),
    createdByUserId: readInt(params, 'createdByUserId'),
    minAmount: readDecimal(params, 'minAmount'),
    maxAmount: readDecimal(params, 'maxAmount'),
    dueFrom: readDate(params, 'dueFrom'),
    dueTo: readDate(params, 'dueTo'),
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

export function serializeTakebackListQuery(query: TakebackListQuery): Params {
  const defaults = DEFAULT_TAKEBACK_QUERY;
  const params: Params = {};

  if (query.searchText) {
    params['searchText'] = query.searchText;
  }
  if (query.status !== null) {
    params['status'] = query.status;
  }
  if (query.reason !== null) {
    params['reason'] = query.reason;
  }
  if (query.createdByUserId !== null) {
    params['createdByUserId'] = query.createdByUserId;
  }
  if (query.minAmount !== null) {
    params['minAmount'] = query.minAmount;
  }
  if (query.maxAmount !== null) {
    params['maxAmount'] = query.maxAmount;
  }
  if (query.dueFrom) {
    params['dueFrom'] = query.dueFrom;
  }
  if (query.dueTo) {
    params['dueTo'] = query.dueTo;
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

export function toTakebackSearchRequest(query: TakebackListQuery): TakebackSearchRequest {
  return {
    pageNumber: query.pageNumber,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortDescending: query.sortDescending,
    searchText: query.searchText || null,
    status: query.status,
    reason: query.reason,
    createdByUserId: query.createdByUserId,
    minAmount: query.minAmount,
    maxAmount: query.maxAmount,
    dueFrom: query.dueFrom || null,
    dueTo: query.dueTo || null,
    overdueOnly: query.overdueOnly
  };
}
