import { Injectable } from '@angular/core';

/** Thin wrapper around window.location so that code which reloads the page can be unit tested. */
@Injectable({ providedIn: 'root' })
export class BrowserLocationService {
  reload(): void {
    window.location.reload();
  }
}
