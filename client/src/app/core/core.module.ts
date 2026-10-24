import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { LOCALE_ID, NgModule, Optional, SkipSelf } from '@angular/core';
import { TitleStrategy } from '@angular/router';

import { APP_LOCALE } from './app-locale';
import { DevUserInterceptor } from './interceptors/dev-user.interceptor';
import { AppTitleStrategy } from './services/app-title.strategy';
import { NavigationHistoryService } from './services/navigation-history.service';

/**
 * Application-wide singletons: the HTTP stack, the interceptors and the locale.
 * Import it once, in the AppModule. (The services themselves are providedIn: 'root'.)
 */
@NgModule({
  imports: [HttpClientModule],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: DevUserInterceptor, multi: true },
    { provide: LOCALE_ID, useValue: APP_LOCALE },
    { provide: TitleStrategy, useExisting: AppTitleStrategy }
  ]
})
export class CoreModule {
  // Injecting NavigationHistoryService here makes sure it sees the very first navigation.
  constructor(
    @Optional() @SkipSelf() parentModule: CoreModule | null,
    navigationHistory: NavigationHistoryService
  ) {
    if (parentModule) {
      throw new Error('CoreModule is already loaded. Import it in the AppModule only.');
    }
    void navigationHistory;
  }
}
