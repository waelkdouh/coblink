import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ActivityDetailComponent } from './activity-detail/activity-detail.component';
import { ActivityFormComponent } from './activity-form/activity-form.component';
import { ActivityListComponent } from './activity-list/activity-list.component';

/** `new` must stay above `:id`, otherwise "new" would be read as an activity id. */
const routes: Routes = [
  { path: '', component: ActivityListComponent, title: 'Activities' },
  { path: 'new', component: ActivityFormComponent, title: 'New activity' },
  { path: ':id', component: ActivityDetailComponent, title: 'Activity' },
  { path: ':id/edit', component: ActivityFormComponent, title: 'Edit activity' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ActivitiesRoutingModule {}
