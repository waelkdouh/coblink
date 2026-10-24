import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';

import { ApiError } from '../../models/api';
import { TEST_LOOKUPS, buildSession } from '../../testing/test-data';
import { createLookupServiceSpy, createSessionServiceSpy } from '../../testing/test-doubles';
import { LookupService } from '../services/lookup.service';
import { SessionService } from '../services/session.service';
import { SessionGuard } from './session.guard';

describe('SessionGuard', () => {
  let guard: SessionGuard;
  let session: jasmine.SpyObj<SessionService>;
  let lookups: jasmine.SpyObj<LookupService>;
  let router: Router;

  beforeEach(() => {
    session = createSessionServiceSpy();
    lookups = createLookupServiceSpy();
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        { provide: SessionService, useValue: session },
        { provide: LookupService, useValue: lookups }
      ]
    });
    guard = TestBed.inject(SessionGuard);
    router = TestBed.inject(Router);
  });

  function run(): boolean | UrlTree | undefined {
    let outcome: boolean | UrlTree | undefined;
    guard.canActivate().subscribe(value => (outcome = value));
    return outcome;
  }

  it('lets the route render once the session and the lookups are loaded', () => {
    session.load.and.returnValue(of(buildSession()));
    lookups.getAll.and.returnValue(of(TEST_LOOKUPS));

    expect(run()).toBeTrue();
    expect(session.load).toHaveBeenCalledTimes(1);
    expect(lookups.getAll).toHaveBeenCalledTimes(1);
    expect(session.reportStartupError).toHaveBeenCalledWith(null);
  });

  it('does not let anything render until both requests are done', () => {
    let finishSession: () => void = () => undefined;
    session.load.and.returnValue(
      new Observable(subscriber => {
        finishSession = () => {
          subscriber.next(buildSession());
          subscriber.complete();
        };
      })
    );
    let outcome: boolean | UrlTree | undefined;

    guard.canActivate().subscribe(value => (outcome = value));
    expect(outcome).toBeUndefined();

    finishSession();
    expect(outcome).toBeTrue();
  });

  it('redirects to /access-denied on 403 FORBIDDEN and keeps the server message', () => {
    session.load.and.returnValue(throwError(() => new ApiError(403, 'FORBIDDEN', 'Your account is not set up for COBLink.')));

    const outcome = run();

    expect(outcome instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(outcome as UrlTree)).toBe('/access-denied');
    expect(session.accessDeniedMessage).toBe('Your account is not set up for COBLink.');
    expect(session.reportStartupError).not.toHaveBeenCalled();
  });

  it('redirects to /access-denied when the lookups answer FORBIDDEN', () => {
    lookups.getAll.and.returnValue(throwError(() => new ApiError(403, 'FORBIDDEN', 'Blocked.')));

    const outcome = run();

    expect(router.serializeUrl(outcome as UrlTree)).toBe('/access-denied');
  });

  it('blocks the navigation and reports other failures to the shell', () => {
    const failure = new ApiError(502, 'UNAVAILABLE', 'The COBLink service is temporarily unavailable.');
    session.load.and.returnValue(throwError(() => failure));

    expect(run()).toBeFalse();
    expect(session.reportStartupError).toHaveBeenCalledWith(failure);
  });

  it('wraps a non-ApiError failure before reporting it', () => {
    session.load.and.returnValue(throwError(() => new Error('boom')));

    expect(run()).toBeFalse();
    const reported = session.reportStartupError.calls.mostRecent().args[0] as ApiError;
    expect(reported).toBeInstanceOf(ApiError);
    expect(reported.message).toBe('boom');
  });
});
