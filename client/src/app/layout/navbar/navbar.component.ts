import { Component, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SessionService } from '../../core/services/session.service';
import { ApiError } from '../../models/api';
import { AppUser } from '../../models/models';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html'
})
export class NavbarComponent implements OnDestroy {
  readonly session$ = this.session.session$;

  /** Collapsed menu on small screens. */
  menuOpen = false;
  personaOpen = false;
  users: AppUser[] = [];
  usersLoading = false;
  usersError: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly session: SessionService) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isDevelopment(): boolean {
    return this.session.isDevelopmentMode;
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenus(): void {
    this.menuOpen = false;
    this.personaOpen = false;
  }

  togglePersonaMenu(): void {
    this.personaOpen = !this.personaOpen;
    if (this.personaOpen && this.users.length === 0 && !this.usersLoading) {
      this.loadUsers();
    }
  }

  isCurrent(user: AppUser): boolean {
    return user.userId === this.session.currentUserId;
  }

  choosePersona(user: AppUser): void {
    this.personaOpen = false;
    if (!this.isCurrent(user)) {
      this.session.switchPersona(user.userName);
    }
  }

  private loadUsers(): void {
    this.usersLoading = true;
    this.usersError = null;
    this.session
      .getAllUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: users => {
          this.users = users;
          this.usersLoading = false;
        },
        error: (error: unknown) => {
          this.usersError = ApiError.from(error).message;
          this.usersLoading = false;
        }
      });
  }
}
