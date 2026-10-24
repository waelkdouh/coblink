import { BehaviorSubject, of } from 'rxjs';

import { ActivityService } from '../core/services/activity.service';
import { DashboardService } from '../core/services/dashboard.service';
import { LookupService } from '../core/services/lookup.service';
import { NavigationHistoryService } from '../core/services/navigation-history.service';
import { NotificationService } from '../core/services/notification.service';
import { SessionService } from '../core/services/session.service';
import { TakebackService } from '../core/services/takeback.service';
import { ApiError } from '../models/api';
import { AppUser, LookupData, SessionInfo } from '../models/models';
import { TEST_LOOKUPS, TEST_USERS, buildSession, buildUser } from './test-data';

/** Replaces a (getter) property of a spy object: `createSpyObj` properties are read-only for the type system. */
export function overrideProperty<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: true });
}

export function createLookupServiceSpy(data: LookupData = TEST_LOOKUPS): jasmine.SpyObj<LookupService> {
  const spy = jasmine.createSpyObj<LookupService>('LookupService', [
    'getAll',
    'getItems',
    'getName',
    'searchMembers',
    'searchProviders'
  ]);
  spy.getAll.and.returnValue(of(data));
  spy.getItems.and.callFake(list => [...data[list]].sort((a, b) => a.sortOrder - b.sortOrder));
  spy.getName.and.callFake((list, id) => data[list].find(item => item.id === id)?.name ?? null);
  spy.searchMembers.and.returnValue(of([]));
  spy.searchProviders.and.returnValue(of([]));
  overrideProperty(spy, 'snapshot', data);
  overrideProperty(spy, 'isLoaded', true);
  return spy;
}

export interface SessionStubOptions {
  user?: AppUser;
  users?: AppUser[];
  /** Authentication mode of the API; Development is the default because it enables the persona switcher. */
  mode?: 'Development' | 'Windows';
  storedPersona?: string | null;
  accessDeniedMessage?: string | null;
}

export interface SessionStub {
  spy: jasmine.SpyObj<SessionService>;
  session$: BehaviorSubject<SessionInfo | null>;
  startupError$: BehaviorSubject<ApiError | null>;
}

/** SessionService double that already holds a session (the guard has run in the real application). */
export function createSessionServiceStub(options: SessionStubOptions = {}): SessionStub {
  const user = options.user ?? buildUser();
  const session = buildSession({ user, authenticationMode: options.mode ?? 'Development' });
  const session$ = new BehaviorSubject<SessionInfo | null>(session);
  const startupError$ = new BehaviorSubject<ApiError | null>(null);

  const spy = jasmine.createSpyObj<SessionService>('SessionService', [
    'getAllUsers',
    'getCurrent',
    'load',
    'hasRole',
    'reportStartupError',
    'switchPersona',
    'useDefaultUser'
  ]);
  spy.getAllUsers.and.returnValue(of(options.users ?? TEST_USERS));
  spy.getCurrent.and.returnValue(of(session));
  spy.load.and.returnValue(of(session));
  overrideProperty(spy, 'session$', session$.asObservable());
  overrideProperty(spy, 'user$', of(user));
  overrideProperty(spy, 'startupError$', startupError$.asObservable());
  overrideProperty(spy, 'snapshot', session);
  overrideProperty(spy, 'isLoaded', true);
  overrideProperty(spy, 'currentUser', user);
  overrideProperty(spy, 'currentUserId', user.userId);
  overrideProperty(spy, 'currentRole', user.role);
  overrideProperty(spy, 'isDevelopmentMode', session.authenticationMode === 'Development');
  overrideProperty(spy, 'storedPersona', options.storedPersona ?? null);
  overrideProperty(spy, 'accessDeniedMessage', options.accessDeniedMessage ?? null);
  return { spy, session$, startupError$ };
}

export function createSessionServiceSpy(options: SessionStubOptions = {}): jasmine.SpyObj<SessionService> {
  return createSessionServiceStub(options).spy;
}

export function createActivityServiceSpy(): jasmine.SpyObj<ActivityService> {
  return jasmine.createSpyObj<ActivityService>('ActivityService', [
    'search',
    'getById',
    'save',
    'complete',
    'reopen',
    'cancel',
    'addNote'
  ]);
}

export function createTakebackServiceSpy(): jasmine.SpyObj<TakebackService> {
  return jasmine.createSpyObj<TakebackService>('TakebackService', [
    'search',
    'getById',
    'save',
    'submit',
    'approve',
    'reject',
    'sendNotice',
    'recordRecovery',
    'dispute',
    'resolveDispute',
    'writeOff',
    'cancel'
  ]);
}

export function createDashboardServiceSpy(): jasmine.SpyObj<DashboardService> {
  return jasmine.createSpyObj<DashboardService>('DashboardService', ['getSummary']);
}

export function createNotificationServiceSpy(): jasmine.SpyObj<NotificationService> {
  return jasmine.createSpyObj<NotificationService>('NotificationService', [
    'success',
    'info',
    'warning',
    'error',
    'dismiss',
    'clear'
  ]);
}

export function createNavigationHistorySpy(): jasmine.SpyObj<NavigationHistoryService> {
  return jasmine.createSpyObj<NavigationHistoryService>('NavigationHistoryService', ['back']);
}

/** The ApiError the data services emit for a failed envelope. */
export function apiError(errorCode: string, message: string, errors: { field: string | null; message: string }[] = []): ApiError {
  return new ApiError(200, errorCode, message, errors);
}
