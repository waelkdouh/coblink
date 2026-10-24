import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { CommentDialogComponent } from './components/comment-dialog/comment-dialog.component';
import { ConcurrencyPanelComponent } from './components/concurrency-panel/concurrency-panel.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { FormAlertComponent } from './components/form-alert/form-alert.component';
import { FormErrorsComponent } from './components/form-errors/form-errors.component';
import { LoadingSpinnerComponent } from './components/loading-spinner/loading-spinner.component';
import { MemberPickerComponent } from './components/member-picker/member-picker.component';
import { ModalComponent } from './components/modal/modal.component';
import { OverdueBadgeComponent } from './components/overdue-badge/overdue-badge.component';
import { PagerComponent } from './components/pager/pager.component';
import { ProviderPickerComponent } from './components/provider-picker/provider-picker.component';
import { SortHeaderComponent } from './components/sort-header/sort-header.component';
import { StatusBadgeComponent } from './components/status-badge/status-badge.component';
import { ClickOutsideDirective } from './directives/click-outside.directive';
import { FieldStateDirective } from './directives/field-state.directive';
import { CalendarDatePipe } from './pipes/calendar-date.pipe';
import { LookupNamePipe } from './pipes/lookup-name.pipe';

const SHARED_DECLARATIONS = [
  CommentDialogComponent,
  ConcurrencyPanelComponent,
  ConfirmDialogComponent,
  EmptyStateComponent,
  FormAlertComponent,
  FormErrorsComponent,
  LoadingSpinnerComponent,
  MemberPickerComponent,
  ModalComponent,
  OverdueBadgeComponent,
  PagerComponent,
  ProviderPickerComponent,
  SortHeaderComponent,
  StatusBadgeComponent,
  ClickOutsideDirective,
  FieldStateDirective,
  CalendarDatePipe,
  LookupNamePipe
];

/** Reusable building blocks, imported by the AppModule and by every feature module. */
@NgModule({
  declarations: SHARED_DECLARATIONS,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  exports: [CommonModule, ReactiveFormsModule, RouterModule, ...SHARED_DECLARATIONS]
})
export class SharedModule {}
