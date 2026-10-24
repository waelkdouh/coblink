import { convertToParamMap } from '@angular/router';

import { TakebackReason, TakebackStatus } from '../../../models/enums';
import {
  DEFAULT_TAKEBACK_QUERY,
  TakebackListQuery,
  isTakebackSortKey,
  parseTakebackListQuery,
  serializeTakebackListQuery,
  toTakebackSearchRequest
} from './takeback-list-query';

describe('takeback list query', () => {
  const parse = (params: Record<string, string>): TakebackListQuery => parseTakebackListQuery(convertToParamMap(params));

  describe('parseTakebackListQuery', () => {
    it('returns the defaults for an empty query string: the newest takebacks first', () => {
      expect(parse({})).toEqual({
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
        pageSize: 20,
        sortBy: 'createdDate',
        sortDescending: true
      });
    });

    it('reads every filter, the page and the sort order', () => {
      expect(
        parse({
          searchText: ' CLM-2025 ',
          status: '5',
          reason: '1',
          createdByUserId: '3',
          minAmount: '100.5',
          maxAmount: '2500',
          dueFrom: '2025-03-01',
          dueTo: '2025-03-31',
          overdueOnly: 'true',
          pageNumber: '2',
          pageSize: '100',
          sortBy: 'takebackAmount',
          sortDescending: 'true'
        })
      ).toEqual({
        searchText: 'CLM-2025',
        status: TakebackStatus.NoticeSent,
        reason: TakebackReason.OtherInsurancePrimary,
        createdByUserId: 3,
        minAmount: 100.5,
        maxAmount: 2500,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        overdueOnly: true,
        pageNumber: 2,
        pageSize: 100,
        sortBy: 'takebackAmount',
        sortDescending: true
      });
    });

    it('falls back to the defaults for values that are unknown or malformed', () => {
      expect(
        parse({
          status: '99',
          reason: 'duplicate',
          createdByUserId: 'me',
          minAmount: 'lots',
          maxAmount: '',
          dueFrom: 'soon',
          dueTo: '2025-02-30',
          overdueOnly: 'maybe',
          pageNumber: '0',
          pageSize: '33',
          sortBy: 'password'
        })
      ).toEqual(DEFAULT_TAKEBACK_QUERY);
    });

    it('sorts ascending when only a sort column is given', () => {
      expect(parse({ sortBy: 'claimNumber' })).toEqual(jasmine.objectContaining({ sortBy: 'claimNumber', sortDescending: false }));
      expect(parse({ sortBy: 'createdDate' })).toEqual(jasmine.objectContaining({ sortBy: 'createdDate', sortDescending: false }));
    });

    it('applies an explicit direction to the default column', () => {
      expect(parse({ sortDescending: 'false' })).toEqual(jasmine.objectContaining({ sortBy: 'createdDate', sortDescending: false }));
      expect(parse({ sortDescending: 'true' })).toEqual(jasmine.objectContaining({ sortBy: 'createdDate', sortDescending: true }));
    });

    it('accepts the dashboard deep links', () => {
      expect(parse({ overdueOnly: 'true' })).toEqual({ ...DEFAULT_TAKEBACK_QUERY, overdueOnly: true });
      expect(parse({ status: '2' })).toEqual({ ...DEFAULT_TAKEBACK_QUERY, status: TakebackStatus.PendingApproval });
    });
  });

  describe('serializeTakebackListQuery', () => {
    it('leaves everything out that equals the defaults', () => {
      expect(serializeTakebackListQuery(DEFAULT_TAKEBACK_QUERY)).toEqual({});
    });

    it('writes only what differs from the defaults', () => {
      expect(
        serializeTakebackListQuery({
          ...DEFAULT_TAKEBACK_QUERY,
          status: TakebackStatus.Disputed,
          minAmount: 0,
          overdueOnly: true,
          pageNumber: 3
        })
      ).toEqual({ status: TakebackStatus.Disputed, minAmount: 0, overdueOnly: true, pageNumber: 3 });
    });

    it('writes the sort column and a descending order that is not the default', () => {
      expect(serializeTakebackListQuery({ ...DEFAULT_TAKEBACK_QUERY, sortBy: 'claimNumber', sortDescending: false })).toEqual({
        sortBy: 'claimNumber'
      });
      expect(serializeTakebackListQuery({ ...DEFAULT_TAKEBACK_QUERY, sortBy: 'claimNumber', sortDescending: true })).toEqual({
        sortBy: 'claimNumber',
        sortDescending: true
      });
    });

    it('writes the default column when only its direction was reversed', () => {
      expect(serializeTakebackListQuery({ ...DEFAULT_TAKEBACK_QUERY, sortDescending: false })).toEqual({ sortBy: 'createdDate' });
    });

    it('survives a round trip through the query string', () => {
      const query: TakebackListQuery = {
        searchText: 'o\'brien & sons',
        status: TakebackStatus.PartiallyRecovered,
        reason: TakebackReason.Other,
        createdByUserId: 2,
        minAmount: 10.25,
        maxAmount: 99999.99,
        dueFrom: '2025-01-01',
        dueTo: '2025-12-31',
        overdueOnly: true,
        pageNumber: 4,
        pageSize: 10,
        sortBy: 'outstandingAmount',
        sortDescending: true
      };
      const asText = Object.fromEntries(Object.entries(serializeTakebackListQuery(query)).map(([key, value]) => [key, String(value)]));

      expect(parse(asText)).toEqual(query);
    });

    it('survives a round trip of every sortable column in both directions', () => {
      for (const sortBy of ['createdDate', 'takebackNumber', 'dueDate', 'status'] as const) {
        for (const sortDescending of [true, false]) {
          const query: TakebackListQuery = { ...DEFAULT_TAKEBACK_QUERY, sortBy, sortDescending };
          const asText = Object.fromEntries(Object.entries(serializeTakebackListQuery(query)).map(([key, value]) => [key, String(value)]));

          expect(parse(asText)).withContext(`${sortBy} ${sortDescending}`).toEqual(query);
        }
      }
    });
  });

  describe('toTakebackSearchRequest', () => {
    it('sends empty text and dates as null', () => {
      expect(toTakebackSearchRequest(DEFAULT_TAKEBACK_QUERY)).toEqual({
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
      });
    });

    it('sends the filters of the query', () => {
      const request = toTakebackSearchRequest({
        ...DEFAULT_TAKEBACK_QUERY,
        searchText: 'CLM',
        status: TakebackStatus.Approved,
        reason: TakebackReason.MedicarePrimary,
        minAmount: 1,
        maxAmount: 2,
        dueFrom: '2025-03-01',
        dueTo: '2025-03-31',
        overdueOnly: true
      });

      expect(request).toEqual(
        jasmine.objectContaining({
          searchText: 'CLM',
          status: TakebackStatus.Approved,
          reason: TakebackReason.MedicarePrimary,
          minAmount: 1,
          maxAmount: 2,
          dueFrom: '2025-03-01',
          dueTo: '2025-03-31',
          overdueOnly: true
        })
      );
    });
  });

  describe('isTakebackSortKey', () => {
    it('accepts the whitelisted keys of the API only', () => {
      expect(isTakebackSortKey('takebackAmount')).toBeTrue();
      expect(isTakebackSortKey('dueDate')).toBeTrue();
      expect(isTakebackSortKey('activityNumber')).toBeFalse();
      expect(isTakebackSortKey('')).toBeFalse();
    });
  });
});
