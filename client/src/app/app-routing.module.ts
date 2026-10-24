import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SessionGuard } from './core/guards/session.guard';
import { AccessDeniedComponent } from './layout/access-denied/access-denied.component';
import { NotFoundComponent } from './layout/not-found/not-found.component';

/**
 * Everything except the access denied page sits behind the SessionGuard, so the session and the lookups are
 * loaded before any screen renders. The feature areas are lazy-loaded NgModules.
 */
const routes: Routes = [
  { path: 'access-denied', component: AccessDeniedComponent, title: 'Access denied' },
  {
    path: '',
    canActivate: [SessionGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule)
      },
      {
        path: 'activities',
        loadChildren: () => import('./features/activities/activities.module').then(m => m.ActivitiesModule)
      },
      {
        path: 'takebacks',
        loadChildren: () => import('./features/takebacks/takebacks.module').then(m => m.TakebacksModule)
      },
      { path: '**', component: NotFoundComponent, title: 'Page not found' }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule {}
