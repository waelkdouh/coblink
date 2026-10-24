import { convertToParamMap } from '@angular/router';

import { ActivityPriority, ActivityStatus, ActivityType } from '../../../models/enums';
import {
  ActivityListQuery,
  DEFAULT_ACTIVITY_QUERY,
  isActivitySortKey,
  parseActivityListQuery,
  serializeActivityListQuery,
  toActivitySearchRequest
} from './activity-list-query';

describe('activity list query', () => {
  const parse = (params: Record<string, string>): ActivityListQuery => parseActivityListQuery(convertToParamMap(params));

  describe('parseActivityListQuery', () => {
    it('returns the defaults for an empty query string: open activities by due date', () => {
      expect(parse({})).toEqual({
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
        pageSize: 20,
        sortBy: 'dueDate',
        sortDescending: false
      });
    });

    it('reads every filter, the page and the sort order', () => {
      const query = parse({
        searchText: ' maria ',
        status: '2',
        activityType: '5',
        priority: '4',
        assignedToUserId: '7',
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        openOnly: 'false',
        overdueOnly: 'true',
        pageNumber: '3',
        pageSize: '50',
        sortBy: 'subject',
        sortDescending: 'true'
      });

      expect(query).toEqual({
        searchText: 'maria',
        status: ActivityStatus.InProgress,
        activityType: ActivityType.MemberOutreach,
        priority: ActivityPriority.Urgent,
        assignedToUserId: 7,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        openOnly: false,
        overdueOnly: true,
        pageNumber: 3,
        pageSize: 50,
        sortBy: 'subject',
        sortDescending: true
      });
    });

    it('falls back to the defaults for values that are unknown or malformed', () => {
      const query = parse({
        status: '99',
        activityType: 'phone',
        priority: '0',
        assignedToUserId: 'me',
        dueFrom: 'yesterday',
        dueTo: '2025-02-30',
        openOnly: 'maybe',
        pageNumber: '-4',
        pageSize: '7',
        sortBy: 'password; drop table'
      });

      expect(query).toEqual(DEFAULT_ACTIVITY_QUERY);
    });

    it('sorts ascending when only the sort column is given', () => {
      expect(parse({ sortBy: 'priority' })).toEqual(jasmine.objectContaining({ sortBy: 'priority', sortDescending: false }));
    });

    it('keeps the default direction when no sort column is given', () => {
      expect(parse({ sortDescending: 'true' }).sortDescending).toBeTrue();
      expect(parse({}).sortDescending).toBeFalse();
    });
  });

  describe('serializeActivityListQuery', () => {
    it('leaves everything out that equals the defaults', () => {
      expect(serializeActivityListQuery(DEFAULT_ACTIVITY_QUERY)).toEqual({});
    });

    it('writes only what differs from the defaults', () => {
      const params = serializeActivityListQuery({
        ...DEFAULT_ACTIVITY_QUERY,
        searchText: 'maria',
        status: ActivityStatus.Completed,
        openOnly: false,
        pageNumber: 2,
        sortBy: 'subject',
        sortDescending: true
      });

      expect(params).toEqual({
        searchText: 'maria',
        status: ActivityStatus.Completed,
        openOnly: false,
        pageNumber: 2,
        sortBy: 'subject',
        sortDescending: true
      });
    });

    it('writes the sort column when only the direction differs from the default', () => {
      expect(serializeActivityListQuery({ ...DEFAULT_ACTIVITY_QUERY, sortDescending: true })).toEqual({
        sortBy: 'dueDate',
        sortDescending: true
      });
    });

    it('survives a round trip through the query string', () => {
      const query: ActivityListQuery = {
        searchText: 'o\'brien & co',
        status: ActivityStatus.Open,
        activityType: ActivityType.Email,
        priority: ActivityPriority.Low,
        assignedToUserId: 3,
        dueFrom: '2025-01-01',
        dueTo: '2025-12-31',
        openOnly: false,
        overdueOnly: true,
        pageNumber: 4,
        pageSize: 100,
        sortBy: 'assignedToName',
        sortDescending: true
      };
      const asText = Object.fromEntries(
        Object.entries(serializeActivityListQuery(query)).map(([key, value]) => [key, String(value)])
      );

      expect(parse(asText)).toEqual(query);
    });
  });

  describe('toActivitySearchRequest', () => {
    it('sends empty text and dates as null', () => {
      expect(toActivitySearchRequest(DEFAULT_ACTIVITY_QUERY)).toEqual({
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
      });
    });

    it('sends the filters of the query', () => {
      const request = toActivitySearchRequest({
        ...DEFAULT_ACTIVITY_QUERY,
        searchText: 'maria',
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        assignedToUserId: 2
      });

      expect(request.searchText).toBe('maria');
      expect(request.dueFrom).toBe('2025-03-01');
      expect(request.dueTo).toBe('2025-03-31');
      expect(request.assignedToUserId).toBe(2);
    });
  });

  describe('isActivitySortKey', () => {
    it('accepts the whitelisted keys of the API only', () => {
      expect(isActivitySortKey('dueDate')).toBeTrue();
      expect(isActivitySortKey('createdDate')).toBeTrue();
      expect(isActivitySortKey('takebackNumber')).toBeFalse();
      expect(isActivitySortKey('')).toBeFalse();
    });
  });
});
