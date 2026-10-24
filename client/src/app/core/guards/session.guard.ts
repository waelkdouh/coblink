import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiError } from '../../models/api';
import { LookupService } from '../services/lookup.service';
import { SessionService } from '../services/session.service';

/**
 * Guards the whole application shell: the session and the lookups must be loaded before any route renders.
 * FORBIDDEN answers lead to the access denied page, every other failure is reported by the shell.
 */
@Injectable({ providedIn: 'root' })
export class SessionGuard implements CanActivate {
  constructor(
    private readonly session: SessionService,
    private readonly lookups: LookupService,
    private readonly router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    return forkJoin([this.session.load(), this.lookups.getAll()]).pipe(
      map(() => {
        this.session.reportStartupError(null);
        return true;
      }),
      catchError((error: unknown) => of(this.handleFailure(ApiError.from(error))))
    );
  }

  private handleFailure(error: ApiError): boolean | UrlTree {
    if (error.isForbidden) {
      this.session.accessDeniedMessage = error.message;
      return this.router.createUrlTree(['/access-denied']);
    }
    this.session.reportStartupError(error);
    return false;
  }
}
