import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { ApiError, ErrorCodes } from '../../models/api';
import { envelope, failedEnvelope } from '../../testing/test-helpers';
import { ApiService } from './api.service';

interface Outcome<T> {
  value?: T;
  error?: ApiError;
}

function capture<T>(call$: Observable<T>): Outcome<T> {
  const outcome: Outcome<T> = {};
  call$.subscribe({
    next: value => (outcome.value = value),
    error: (error: unknown) => (outcome.error = error as ApiError)
  });
  return outcome;
}

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs a relative /api url and unwraps the envelope data', () => {
    const outcome = capture(api.get<{ name: string }>('Lookup/GetAll'));

    const request = http.expectOne('/api/Lookup/GetAll');
    expect(request.request.method).toBe('GET');
    request.flush(envelope({ name: 'lookups' }));

    expect(outcome.value).toEqual({ name: 'lookups' });
    expect(outcome.error).toBeUndefined();
  });

  it('adds only meaningful query parameters', () => {
    capture(api.get('Lookup/SearchMembers', { term: 'lo', max: 15, flag: false, empty: '', missing: null, unset: undefined }));

    const request = http.expectOne(req => req.url === '/api/Lookup/SearchMembers');
    expect(request.request.params.keys().sort()).toEqual(['flag', 'max', 'term']);
    expect(request.request.params.get('max')).toBe('15');
    expect(request.request.params.get('flag')).toBe('false');
    request.flush(envelope([]));
  });

  it('tolerates a leading slash in the path', () => {
    const outcome = capture(api.get<{ ok: boolean }>('/User/GetCurrent'));

    http.expectOne('/api/User/GetCurrent').flush(envelope({ ok: true }));

    expect(outcome.value).toEqual({ ok: true });
  });

  it('POSTs the body unchanged', () => {
    const body = { activityId: 0, rowVersion: null, subject: 'Call back' };
    const outcome = capture(api.post<{ ok: boolean }>('Activity/Save', body));

    const request = http.expectOne('/api/Activity/Save');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush(envelope({ ok: true }));

    expect(outcome.value).toEqual({ ok: true });
  });

  it('throws an ApiError when the envelope says success = false (HTTP 200)', () => {
    const outcome = capture(api.post('Activity/Save', {}));

    http.expectOne('/api/Activity/Save').flush(
      failedEnvelope(ErrorCodes.validation, 'Validation failed.', [
        { field: 'subject', message: 'Subject is required.' },
        { field: null, message: 'Fix the highlighted fields.' }
      ])
    );

    expect(outcome.value).toBeUndefined();
    const error = outcome.error as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(200);
    expect(error.errorCode).toBe('VALIDATION');
    expect(error.message).toBe('Validation failed.');
    expect(error.errors.length).toBe(2);
    expect(error.fieldErrors()).toEqual({ subject: ['Subject is required.'] });
  });

  it('keeps the CONCURRENCY code so screens can offer a reload', () => {
    const outcome = capture(api.post('Takeback/Approve', {}));

    http.expectOne('/api/Takeback/Approve').flush(failedEnvelope('CONCURRENCY', 'The record was changed by another user.'));

    expect(outcome.error?.errorCode).toBe('CONCURRENCY');
    expect(outcome.error?.isConcurrency).toBeTrue();
  });

  it('maps a 403 with an envelope to FORBIDDEN and keeps the server message', () => {
    const outcome = capture(api.get('User/GetCurrent'));

    http
      .expectOne('/api/User/GetCurrent')
      .flush(failedEnvelope('FORBIDDEN', 'Your account is not set up for COBLink.'), { status: 403, statusText: 'Forbidden' });

    expect(outcome.error?.status).toBe(403);
    expect(outcome.error?.errorCode).toBe('FORBIDDEN');
    expect(outcome.error?.isForbidden).toBeTrue();
    expect(outcome.error?.message).toBe('Your account is not set up for COBLink.');
  });

  it('maps a 401 without an envelope to a friendly authentication message', () => {
    const outcome = capture(api.get('User/GetCurrent'));

    http.expectOne('/api/User/GetCurrent').flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(outcome.error?.status).toBe(401);
    expect(outcome.error?.errorCode).toBe(ErrorCodes.unauthenticated);
    expect(outcome.error?.message).toContain('You are not authenticated');
  });

  it('maps a network failure (status 0) to a friendly message', () => {
    const outcome = capture(api.get('Dashboard/GetSummary'));

    http.expectOne('/api/Dashboard/GetSummary').error(new ProgressEvent('error'), { status: 0 });

    expect(outcome.error?.status).toBe(0);
    expect(outcome.error?.errorCode).toBe(ErrorCodes.network);
    expect(outcome.error?.message).toContain('Cannot reach the COBLink service');
  });

  it('maps a 500 envelope to SERVER_ERROR and keeps its message', () => {
    const outcome = capture(api.post('Takeback/Save', {}));

    http
      .expectOne('/api/Takeback/Save')
      .flush(failedEnvelope('SERVER_ERROR', 'An unexpected error occurred. Reference 42.'), { status: 500, statusText: 'Server Error' });

    expect(outcome.error?.status).toBe(500);
    expect(outcome.error?.errorCode).toBe('SERVER_ERROR');
    expect(outcome.error?.message).toBe('An unexpected error occurred. Reference 42.');
  });

  it('maps a 500 without an envelope to a generic server message', () => {
    const outcome = capture(api.get('Dashboard/GetSummary'));

    http.expectOne('/api/Dashboard/GetSummary').flush('<h1>Boom</h1>', { status: 500, statusText: 'Server Error' });

    expect(outcome.error?.errorCode).toBe(ErrorCodes.serverError);
    expect(outcome.error?.message).toContain('unexpected error');
  });

  it('maps a gateway HTML page (502) to the service unavailable message', () => {
    const outcome = capture(api.get('Dashboard/GetSummary'));

    http.expectOne('/api/Dashboard/GetSummary').flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });

    expect(outcome.error?.status).toBe(502);
    expect(outcome.error?.errorCode).toBe(ErrorCodes.unavailable);
    expect(outcome.error?.message).toContain('temporarily unavailable');
  });

  it('maps a 400 envelope to BAD_REQUEST', () => {
    const outcome = capture(api.get('Activity/GetById', { id: 'x' }));

    http
      .expectOne(req => req.url === '/api/Activity/GetById')
      .flush(failedEnvelope('BAD_REQUEST', 'The id is not valid.'), { status: 400, statusText: 'Bad Request' });

    expect(outcome.error?.errorCode).toBe('BAD_REQUEST');
    expect(outcome.error?.message).toBe('The id is not valid.');
  });

  it('reports a malformed 200 body (not an envelope) as an unexpected response', () => {
    const textBody = capture(api.get('Dashboard/GetSummary'));
    http.expectOne('/api/Dashboard/GetSummary').flush('this is not json');
    expect(textBody.error?.errorCode).toBe(ErrorCodes.unexpected);
    expect(textBody.error?.message).toContain('unexpected response');

    const emptyBody = capture(api.get('Dashboard/GetSummary'));
    http.expectOne('/api/Dashboard/GetSummary').flush(null);
    expect(emptyBody.error?.errorCode).toBe(ErrorCodes.unexpected);
  });
});

describe('ApiError', () => {
  it('groups field messages by field and lists the general ones separately', () => {
    const error = new ApiError(200, 'VALIDATION', 'Validation failed.', [
      { field: 'amount', message: 'Too high.' },
      { field: 'amount', message: 'Too many decimals.' },
      { field: 'method', message: 'Pick a method.' },
      { field: null, message: 'General problem.' }
    ]);

    expect(error.fieldErrors()).toEqual({ amount: ['Too high.', 'Too many decimals.'], method: ['Pick a method.'] });
    expect(error.generalErrors()).toEqual(['General problem.']);
    expect(error.isValidation).toBeTrue();
  });

  it('wraps unknown failures into an ApiError and keeps existing ones', () => {
    const existing = new ApiError(404, 'NOT_FOUND', 'Gone.');
    expect(ApiError.from(existing)).toBe(existing);

    const wrapped = ApiError.from(new Error('boom'));
    expect(wrapped.message).toBe('boom');
    expect(wrapped.errorCode).toBe(ErrorCodes.unexpected);

    expect(ApiError.from('weird').message).toBe('An unexpected error occurred.');
  });
});
