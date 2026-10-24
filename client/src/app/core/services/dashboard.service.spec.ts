import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { buildSummary } from '../../testing/test-data';
import { envelope } from '../../testing/test-helpers';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(DashboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getSummary GETs Dashboard/GetSummary and returns the unwrapped summary', () => {
    const summary = buildSummary();
    let result: unknown;

    service.getSummary().subscribe(value => (result = value));

    const request = http.expectOne('/api/Dashboard/GetSummary');
    expect(request.request.method).toBe('GET');
    request.flush(envelope(summary));
    expect(result).toEqual(summary);
  });
});
