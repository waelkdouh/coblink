import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RecoveryMethod, TakebackReason } from '../../models/enums';
import { SaveTakebackRequest, TakebackSearchRequest } from '../../models/models';
import { TEST_ROW_VERSION, buildPage, buildTakeback, buildTakebackListItem } from '../../testing/test-data';
import { envelope } from '../../testing/test-helpers';
import { TakebackService } from './takeback.service';

describe('TakebackService', () => {
  let service: TakebackService;
  let http: HttpTestingController;

  const action = { takebackId: 7, comment: 'Because.', rowVersion: TEST_ROW_VERSION };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(TakebackService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('search POSTs the filter to Takeback/Search', () => {
    const search: TakebackSearchRequest = {
      pageNumber: 1,
      pageSize: 20,
      sortBy: 'createdDate',
      sortDescending: true,
      searchText: 'CLM',
      minAmount: 100,
      maxAmount: 900.5,
      overdueOnly: true
    };
    const page = buildPage([buildTakebackListItem()]);
    let result: unknown;

    service.search(search).subscribe(value => (result = value));

    const request = http.expectOne('/api/Takeback/Search');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(search);
    request.flush(envelope(page));
    expect(result).toEqual(page);
  });

  it('getById GETs Takeback/GetById?id=', () => {
    let result: unknown;

    service.getById(7).subscribe(value => (result = value));

    const request = http.expectOne(req => req.url === '/api/Takeback/GetById');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('id')).toBe('7');
    request.flush(envelope(buildTakeback()));
    expect((result as { takebackId: number }).takebackId).toBe(7);
  });

  it('save POSTs the request with its rowVersion', () => {
    const save: SaveTakebackRequest = {
      takebackId: 7,
      claimNumber: 'CLM-1',
      memberId: 11,
      providerId: 21,
      reason: TakebackReason.OtherInsurancePrimary,
      dateOfService: '2025-01-15',
      originalPaidAmount: 500,
      takebackAmount: 250.5,
      otherCarrierName: 'Acme Health',
      otherPolicyNumber: null,
      notes: null,
      rowVersion: TEST_ROW_VERSION
    };

    service.save(save).subscribe();

    const request = http.expectOne('/api/Takeback/Save');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(save);
    request.flush(envelope(buildTakeback()));
  });

  it('every simple action POSTs { takebackId, comment, rowVersion } to its own endpoint', () => {
    const calls: [string, () => void][] = [
      ['Submit', () => service.submit(action).subscribe()],
      ['Approve', () => service.approve(action).subscribe()],
      ['Reject', () => service.reject(action).subscribe()],
      ['SendNotice', () => service.sendNotice(action).subscribe()],
      ['Dispute', () => service.dispute(action).subscribe()],
      ['WriteOff', () => service.writeOff(action).subscribe()],
      ['Cancel', () => service.cancel(action).subscribe()]
    ];

    for (const [name, run] of calls) {
      run();
      const request = http.expectOne(`/api/Takeback/${name}`);
      expect(request.request.method).withContext(name).toBe('POST');
      expect(request.request.body).withContext(name).toEqual(action);
      request.flush(envelope(buildTakeback()));
    }
  });

  it('recordRecovery POSTs the recovery with the rowVersion', () => {
    const recovery = {
      takebackId: 7,
      amount: 125.25,
      recoveryDate: '2025-03-20',
      method: RecoveryMethod.Check,
      referenceNumber: 'CHK-1',
      notes: null,
      rowVersion: TEST_ROW_VERSION
    };

    service.recordRecovery(recovery).subscribe();

    const request = http.expectOne('/api/Takeback/RecordRecovery');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(recovery);
    request.flush(envelope(buildTakeback()));
  });

  it('resolveDispute POSTs the decision (upheld) with the comment', () => {
    service.resolveDispute({ ...action, upheld: false }).subscribe();

    const request = http.expectOne('/api/Takeback/ResolveDispute');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ ...action, upheld: false });
    request.flush(envelope(buildTakeback()));
  });
});
