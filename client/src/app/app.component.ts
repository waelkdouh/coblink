import { Component } from '@angular/core';

import { BrowserLocationService } from './core/services/browser-location.service';
import { SessionService } from './core/services/session.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  readonly startupError$ = this.session.startupError$;

  constructor(
    private readonly session: SessionService,
    private readonly browserLocation: BrowserLocationService
  ) {}

  /** The skip link cannot use href="#main-content": with <base href="/"> it would navigate to the root URL. */
  skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }

  retry(): void {
    this.browserLocation.reload();
  }
}
