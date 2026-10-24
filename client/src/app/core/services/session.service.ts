import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';

import { ApiError } from '../../models/api';
import { UserRole } from '../../models/enums';
import { AppUser, SessionInfo } from '../../models/models';
import { ApiService } from '../api/api.service';
import { BrowserLocationService } from './browser-location.service';
import { DevPersonaStorage } from './dev-persona-storage.service';

/** Who is signed in, how, and (in Development) which persona the developer is impersonating. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly sessionSubject = new BehaviorSubject<SessionInfo | null>(null);
  private readonly startupErrorSubject = new BehaviorSubject<ApiError | null>(null);
  private load$: Observable<SessionInfo> | null = null;
  private users$: Observable<AppUser[]> | null = null;

  readonly session$: Observable<SessionInfo | null> = this.sessionSubject.asObservable();
  readonly user$: Observable<AppUser | null> = this.session$.pipe(map(session => (session ? session.user : null)));

  /** Set by the SessionGuard when the session could not be established for another reason than access denied. */
  readonly startupError$: Observable<ApiError | null> = this.startupErrorSubject.asObservable();

  /** Server message of the last FORBIDDEN answer; shown on the access denied page. */
  accessDeniedMessage: string | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly persona: DevPersonaStorage,
    private readonly browserLocation: BrowserLocationService
  ) {}

  get snapshot(): SessionInfo | null {
    return this.sessionSubject.value;
  }

  get isLoaded(): boolean {
    return this.snapshot !== null;
  }

  get currentUser(): AppUser | null {
    return this.snapshot ? this.snapshot.user : null;
  }

  get currentUserId(): number | null {
    return this.currentUser ? this.currentUser.userId : null;
  }

  get currentRole(): UserRole | null {
    return this.currentUser ? this.currentUser.role : null;
  }

  /** True when the API accepts the X-CobLink-User header, i.e. when the persona switcher makes sense. */
  get isDevelopmentMode(): boolean {
    return this.snapshot?.authenticationMode === 'Development';
  }

  /** The persona stored in the browser, if any (only ever set from the Development persona switcher). */
  get storedPersona(): string | null {
    return this.persona.get();
  }

  hasRole(...roles: UserRole[]): boolean {
    const role = this.currentRole;
    return role !== null && roles.includes(role);
  }

  /** GET /api/User/GetCurrent - always asks the server and refreshes the cached session. */
  getCurrent(): Observable<SessionInfo> {
    return this.api.get<SessionInfo>('User/GetCurrent').pipe(
      tap(session => {
        this.sessionSubject.next(session);
        this.accessDeniedMessage = null;
        this.startupErrorSubject.next(null);
      })
    );
  }

  /** The session, requested once and then replayed (a failed attempt is retried by the next subscriber). */
  load(): Observable<SessionInfo> {
    if (!this.load$) {
      this.load$ = this.getCurrent().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.load$;
  }

  /** GET /api/User/GetAll - the active users, cached for the lifetime of the page. */
  getAllUsers(): Observable<AppUser[]> {
    if (!this.users$) {
      this.users$ = this.api.get<AppUser[]>('User/GetAll').pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.users$;
  }

  reportStartupError(error: ApiError | null): void {
    this.startupErrorSubject.next(error);
  }

  /** Impersonate another user (Development only): remember the user name and reload so every request carries it. */
  switchPersona(userName: string): void {
    this.persona.set(userName);
    this.browserLocation.reload();
  }

  /** Forget the stored persona so the API falls back to its configured default user. */
  useDefaultUser(): void {
    this.persona.clear();
    this.browserLocation.reload();
  }
}
