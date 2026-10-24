import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiError } from '../../models/api';
import { UserRole } from '../../models/enums';
import { TEST_USERS, buildSession, buildUser } from '../../testing/test-data';
import { envelope, failedEnvelope } from '../../testing/test-helpers';
import { BrowserLocationService } from './browser-location.service';
import { DevPersonaStorage } from './dev-persona-storage.service';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let http: HttpTestingController;
  let location: jasmine.SpyObj<BrowserLocationService>;

  beforeEach(() => {
    location = jasmine.createSpyObj<BrowserLocationService>('BrowserLocationService', ['reload']);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: BrowserLocationService, useValue: location }]
    });
    service = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(DevPersonaStorage.key);
  });

  function loadSession(overrides = {}): void {
    service.getCurrent().subscribe();
    http.expectOne('/api/User/GetCurrent').flush(envelope(buildSession(overrides)));
  }

  it('starts without a session', () => {
    expect(service.isLoaded).toBeFalse();
    expect(service.snapshot).toBeNull();
    expect(service.currentUser).toBeNull();
    expect(service.currentUserId).toBeNull();
    expect(service.currentRole).toBeNull();
    expect(service.isDevelopmentMode).toBeFalse();
    expect(service.hasRole(UserRole.Admin)).toBeFalse();
  });

  it('GETs User/GetCurrent and exposes the signed-in user', () => {
    const emitted: (string | null)[] = [];
    service.user$.subscribe(user => emitted.push(user ? user.displayName : null));

    loadSession({ user: buildUser({ userId: 9, displayName: 'Sam Supervisor', role: UserRole.Supervisor }) });

    expect(service.isLoaded).toBeTrue();
    expect(service.currentUserId).toBe(9);
    expect(service.currentRole).toBe(UserRole.Supervisor);
    expect(emitted).toEqual([null, 'Sam Supervisor']);
  });

  it('hasRole is true for any of the given roles', () => {
    loadSession({ user: buildUser({ role: UserRole.Supervisor }) });

    expect(service.hasRole(UserRole.Supervisor, UserRole.Admin)).toBeTrue();
    expect(service.hasRole(UserRole.Analyst)).toBeFalse();
  });

  it('load() asks the server once and replays the session', () => {
    service.load().subscribe();
    service.load().subscribe();

    http.expectOne('/api/User/GetCurrent').flush(envelope(buildSession()));
    http.expectNone('/api/User/GetCurrent');

    let replayed: unknown;
    service.load().subscribe(session => (replayed = session));
    expect(replayed).toBeTruthy();
  });

  it('load() is retried after a failure', () => {
    let failure: ApiError | null = null;
    service.load().subscribe({ error: (error: ApiError) => (failure = error) });
    http.expectOne('/api/User/GetCurrent').flush(failedEnvelope('FORBIDDEN', 'No access.'), { status: 403, statusText: 'Forbidden' });
    expect((failure as ApiError | null)?.isForbidden).toBeTrue();

    service.load().subscribe();
    http.expectOne('/api/User/GetCurrent').flush(envelope(buildSession()));
    expect(service.isLoaded).toBeTrue();
  });

  it('is in development mode only when the API says so', () => {
    loadSession({ authenticationMode: 'Development' });
    expect(service.isDevelopmentMode).toBeTrue();

    loadSession({ authenticationMode: 'Windows' });
    expect(service.isDevelopmentMode).toBeFalse();
  });

  it('getAllUsers GETs User/GetAll once and caches the list', () => {
    let users: unknown;

    service.getAllUsers().subscribe(value => (users = value));
    service.getAllUsers().subscribe();

    http.expectOne('/api/User/GetAll').flush(envelope(TEST_USERS));
    http.expectNone('/api/User/GetAll');
    expect(users).toEqual(TEST_USERS);
  });

  it('switchPersona stores the user name in localStorage and reloads the page', () => {
    service.switchPersona('COBLINK\\sam.supervisor');

    expect(localStorage.getItem('coblink.devUser')).toBe('COBLINK\\sam.supervisor');
    expect(service.storedPersona).toBe('COBLINK\\sam.supervisor');
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it('useDefaultUser forgets the persona and reloads the page', () => {
    localStorage.setItem('coblink.devUser', 'COBLINK\\sam.supervisor');

    service.useDefaultUser();

    expect(localStorage.getItem('coblink.devUser')).toBeNull();
    expect(service.storedPersona).toBeNull();
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it('remembers startup errors for the shell', () => {
    const emitted: (ApiError | null)[] = [];
    service.startupError$.subscribe(error => emitted.push(error));
    const error = new ApiError(502, 'UNAVAILABLE', 'Down.');

    service.reportStartupError(error);

    expect(emitted).toEqual([null, error]);
  });
});

describe('DevPersonaStorage', () => {
  let storage: DevPersonaStorage;

  beforeEach(() => {
    storage = TestBed.inject(DevPersonaStorage);
  });

  afterEach(() => localStorage.removeItem(DevPersonaStorage.key));

  it('treats a missing or blank value as no persona', () => {
    expect(storage.get()).toBeNull();
    localStorage.setItem(DevPersonaStorage.key, '   ');
    expect(storage.get()).toBeNull();
  });

  it('round-trips a user name through localStorage', () => {
    storage.set('COBLINK\\ada.admin');
    expect(storage.get()).toBe('COBLINK\\ada.admin');
    storage.clear();
    expect(storage.get()).toBeNull();
  });

  it('survives a browser that denies storage access', () => {
    const denied = (): never => {
      throw new DOMException('Access denied', 'SecurityError');
    };
    const spies = [
      spyOn(Storage.prototype, 'getItem').and.callFake(denied),
      spyOn(Storage.prototype, 'setItem').and.callFake(denied),
      spyOn(Storage.prototype, 'removeItem').and.callFake(denied)
    ];

    expect(storage.get()).toBeNull();
    expect(() => storage.set('x')).not.toThrow();
    expect(() => storage.clear()).not.toThrow();

    // The afterEach clean-up above runs while the spies are still installed.
    spies.forEach(spy => spy.and.callThrough());
  });
});
