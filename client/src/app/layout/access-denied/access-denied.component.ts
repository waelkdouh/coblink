import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SessionService } from '../../core/services/session.service';
import { ApiError } from '../../models/api';

@Component({
  selector: 'app-access-denied',
  templateUrl: './access-denied.component.html'
})
export class AccessDeniedComponent implements OnInit, OnDestroy {
  message: string | null = null;
  checking = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly session: SessionService,
    private readonly router: Router
  ) {}

  /**
   * Offered while a persona is stored (or the session says Development): clearing it makes the API fall back
   * to its configured default user, which gets a Development user out of a dead end.
   */
  get canUseDefaultUser(): boolean {
    return this.session.isDevelopmentMode || this.session.storedPersona !== null;
  }

  ngOnInit(): void {
    this.message = this.session.accessDeniedMessage;
    if (this.message === null) {
      // The page was opened directly (or reloaded): ask the server why access was refused.
      this.probe();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  useDefaultUser(): void {
    this.session.useDefaultUser();
  }

  private probe(): void {
    this.checking = true;
    this.session
      .getCurrent()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.checking = false;
          void this.router.navigateByUrl('/');
        },
        error: (error: unknown) => {
          this.checking = false;
          this.message = ApiError.from(error).message;
        }
      });
  }
}
