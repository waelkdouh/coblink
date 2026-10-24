import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** "Dashboard - COBLink": the route titles are static, the suffix keeps the application name in the tab. */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  static readonly applicationName = 'COBLink';

  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(
      pageTitle ? `${pageTitle} - ${AppTitleStrategy.applicationName}` : AppTitleStrategy.applicationName
    );
  }
}
