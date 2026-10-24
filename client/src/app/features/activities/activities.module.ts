import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';
import { ActivitiesRoutingModule } from './activities-routing.module';
import { ActivityDetailComponent } from './activity-detail/activity-detail.component';
import { ActivityFormComponent } from './activity-form/activity-form.component';
import { ActivityListComponent } from './activity-list/activity-list.component';

@NgModule({
  declarations: [ActivityListComponent, ActivityFormComponent, ActivityDetailComponent],
  imports: [SharedModule, ActivitiesRoutingModule]
})
export class ActivitiesModule {}
