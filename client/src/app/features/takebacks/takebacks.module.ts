import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';
import { RecordRecoveryDialogComponent } from './record-recovery-dialog/record-recovery-dialog.component';
import { ResolveDisputeDialogComponent } from './resolve-dispute-dialog/resolve-dispute-dialog.component';
import { TakebackDetailComponent } from './takeback-detail/takeback-detail.component';
import { TakebackFormComponent } from './takeback-form/takeback-form.component';
import { TakebackListComponent } from './takeback-list/takeback-list.component';
import { TakebacksRoutingModule } from './takebacks-routing.module';

@NgModule({
  declarations: [
    TakebackListComponent,
    TakebackFormComponent,
    TakebackDetailComponent,
    RecordRecoveryDialogComponent,
    ResolveDisputeDialogComponent
  ],
  imports: [SharedModule, TakebacksRoutingModule]
})
export class TakebacksModule {}
