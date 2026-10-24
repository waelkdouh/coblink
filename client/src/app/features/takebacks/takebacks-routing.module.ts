import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TakebackDetailComponent } from './takeback-detail/takeback-detail.component';
import { TakebackFormComponent } from './takeback-form/takeback-form.component';
import { TakebackListComponent } from './takeback-list/takeback-list.component';

/** `new` must stay above `:id`, otherwise "new" would be read as a takeback id. */
const routes: Routes = [
  { path: '', component: TakebackListComponent, title: 'Takebacks' },
  { path: 'new', component: TakebackFormComponent, title: 'New takeback' },
  { path: ':id', component: TakebackDetailComponent, title: 'Takeback' },
  { path: ':id/edit', component: TakebackFormComponent, title: 'Edit takeback' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TakebacksRoutingModule {}
