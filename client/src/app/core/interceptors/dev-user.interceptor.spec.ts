import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DevPersonaStorage } from '../services/dev-persona-storage.service';
import { DevUserInterceptor } from './dev-user.interceptor';

describe('DevUserInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: HTTP_INTERCEPTORS, useClass: DevUserInterceptor, multi: true }]
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    localStorage.removeItem(DevPersonaStorage.key);
  });

  it('adds X-CobLink-User to /api calls when a persona is stored', () => {
    localStorage.setItem('coblink.devUser', 'COBLINK\\sam.supervisor');

    http.get('/api/User/GetCurrent').subscribe();

    const request = controller.expectOne('/api/User/GetCurrent');
    expect(request.request.headers.get('X-CobLink-User')).toBe('COBLINK\\sam.supervisor');
    request.flush({});
  });

  it('sends the header with POST requests as well', () => {
    localStorage.setItem('coblink.devUser', 'COBLINK\\ada.admin');

    http.post('/api/Activity/Search', {}).subscribe();

    const request = controller.expectOne('/api/Activity/Search');
    expect(request.request.headers.get('X-CobLink-User')).toBe('COBLINK\\ada.admin');
    request.flush({});
  });

  it('leaves requests alone when no persona is stored', () => {
    http.get('/api/User/GetCurrent').subscribe();

    const request = controller.expectOne('/api/User/GetCurrent');
    expect(request.request.headers.has('X-CobLink-User')).toBeFalse();
    request.flush({});
  });

  it('ignores a blank stored value', () => {
    localStorage.setItem('coblink.devUser', '  ');

    http.get('/api/User/GetCurrent').subscribe();

    const request = controller.expectOne('/api/User/GetCurrent');
    expect(request.request.headers.has('X-CobLink-User')).toBeFalse();
    request.flush({});
  });

  it('does not leak the persona to calls that are not /api calls', () => {
    localStorage.setItem('coblink.devUser', 'COBLINK\\sam.supervisor');

    http.get('/assets/config.json').subscribe();
    http.get('https://example.com/other').subscribe();

    const local = controller.expectOne('/assets/config.json');
    expect(local.request.headers.has('X-CobLink-User')).toBeFalse();
    local.flush({});
    const remote = controller.expectOne('https://example.com/other');
    expect(remote.request.headers.has('X-CobLink-User')).toBeFalse();
    remote.flush({});
  });
});
