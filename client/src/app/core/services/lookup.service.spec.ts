import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_LOOKUPS, buildMember, buildProvider } from '../../testing/test-data';
import { envelope } from '../../testing/test-helpers';
import { LookupService } from './lookup.service';

describe('LookupService', () => {
  let service: LookupService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(LookupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadLookups(): void {
    service.getAll().subscribe();
    http.expectOne('/api/Lookup/GetAll').flush(envelope(TEST_LOOKUPS));
  }

  it('has nothing to show before the lookups are loaded', () => {
    expect(service.isLoaded).toBeFalse();
    expect(service.snapshot).toBeNull();
    expect(service.getItems('activityTypes')).toEqual([]);
    expect(service.getName('activityTypes', 1)).toBeNull();
  });

  it('GETs Lookup/GetAll once and replays the cached answer to later subscribers', () => {
    let first: unknown;
    let second: unknown;

    service.getAll().subscribe(value => (first = value));
    service.getAll().subscribe(value => (second = value));

    http.expectOne('/api/Lookup/GetAll').flush(envelope(TEST_LOOKUPS));
    http.expectNone('/api/Lookup/GetAll');

    expect(first).toBe(TEST_LOOKUPS);
    expect(second).toBe(TEST_LOOKUPS);
    expect(service.isLoaded).toBeTrue();
  });

  it('retries after a failed load instead of caching the error', () => {
    service.getAll().subscribe({ error: () => undefined });
    http.expectOne('/api/Lookup/GetAll').error(new ProgressEvent('error'), { status: 0 });

    service.getAll().subscribe();
    http.expectOne('/api/Lookup/GetAll').flush(envelope(TEST_LOOKUPS));

    expect(service.isLoaded).toBeTrue();
  });

  it('answers names and items synchronously once loaded', () => {
    loadLookups();

    expect(service.getName('takebackStatuses', 5)).toBe('Notice Sent');
    expect(service.getName('recoveryMethods', 2)).toBe('EFT');
    expect(service.getName('recoveryMethods', 99)).toBeNull();
    expect(service.getName('recoveryMethods', null)).toBeNull();
    expect(service.getItems('activityPriorities').map(item => item.name)).toEqual(['Low', 'Normal', 'High', 'Urgent']);
  });

  it('orders items by sortOrder, then by id', () => {
    service.getAll().subscribe();
    http.expectOne('/api/Lookup/GetAll').flush(
      envelope({
        ...TEST_LOOKUPS,
        activityPriorities: [
          { id: 3, code: 'C', name: 'Third', sortOrder: 2 },
          { id: 2, code: 'B', name: 'Second', sortOrder: 2 },
          { id: 1, code: 'A', name: 'First', sortOrder: 1 }
        ]
      })
    );

    expect(service.getItems('activityPriorities').map(item => item.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('searchMembers GETs Lookup/SearchMembers with term and max', () => {
    const members = [buildMember()];
    let result: unknown;

    service.searchMembers('lop').subscribe(value => (result = value));

    const request = http.expectOne(req => req.url === '/api/Lookup/SearchMembers');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('term')).toBe('lop');
    expect(request.request.params.get('max')).toBe(String(LookupService.defaultSearchSize));
    request.flush(envelope(members));
    expect(result).toEqual(members);
  });

  it('searchProviders GETs Lookup/SearchProviders with a custom page size', () => {
    service.searchProviders('river', 5).subscribe();

    const request = http.expectOne(req => req.url === '/api/Lookup/SearchProviders');
    expect(request.request.params.get('term')).toBe('river');
    expect(request.request.params.get('max')).toBe('5');
    request.flush(envelope([buildProvider()]));
  });
});
