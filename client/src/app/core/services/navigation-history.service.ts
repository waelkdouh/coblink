import { Location } from '@angular/common';
import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Remembers whether the user navigated inside the app, so a Cancel button can return to the previous page
 * and still work when the page was opened directly.
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private completedNavigations = 0;

  constructor(
    private readonly router: Router,
    private readonly location: Location
  ) {
    // Lives as long as the application: this root service is never destroyed.
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.completedNavigations++);
  }

  get canGoBack(): boolean {
    return this.completedNavigations > 1;
  }

  back(fallbackUrl: string): void {
    if (this.canGoBack) {
      this.location.back();
    } else {
      void this.router.navigateByUrl(fallbackUrl);
    }
  }
}
