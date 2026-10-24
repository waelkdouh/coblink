import { NgModule } from '@angular/core';

import { SharedModule } from '../shared/shared.module';
import { AccessDeniedComponent } from './access-denied/access-denied.component';
import { FooterComponent } from './footer/footer.component';
import { NavbarComponent } from './navbar/navbar.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { ToastContainerComponent } from './toast-container/toast-container.component';

/** The application shell: navbar, toasts, footer and the two routed pages (access denied, not found). */
@NgModule({
  declarations: [
    AccessDeniedComponent,
    FooterComponent,
    NavbarComponent,
    NotFoundComponent,
    ToastContainerComponent
  ],
  imports: [SharedModule],
  exports: [AccessDeniedComponent, FooterComponent, NavbarComponent, NotFoundComponent, ToastContainerComponent]
})
export class LayoutModule {}
