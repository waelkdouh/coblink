import { Component, ElementRef, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

import { ApiError } from '../../../models/api';
import { applyServerErrors, focusFirstInvalid, showError } from '../../../shared/utils/form-utils';
import { requiredText } from '../../../shared/validators/app-validators';

/** What the dialog hands to its parent; the parent adds the takeback id and the rowVersion. */
export interface ResolveDisputeFormValue {
  /** True: the takeback stands. False: the dispute is accepted and the takeback is cancelled. */
  upheld: boolean;
  comment: string;
}

/** Dialog for a supervisor to decide a disputed takeback. */
@Component({
  selector: 'app-resolve-dispute-dialog',
  templateUrl: './resolve-dispute-dialog.component.html'
})
export class ResolveDisputeDialogComponent {
  static readonly maxCommentLength = 1000;

  @Input() busy = false;

  @Output() confirmed = new EventEmitter<ResolveDisputeFormValue>();
  @Output() cancelled = new EventEmitter<void>();

  readonly formId = 'resolve-dispute-form';
  readonly showError = showError;
  readonly maxCommentLength = ResolveDisputeDialogComponent.maxCommentLength;

  readonly form = this.fb.group({
    upheld: this.fb.control<boolean | null>(null, Validators.required),
    comment: this.fb.nonNullable.control('', [requiredText, Validators.maxLength(ResolveDisputeDialogComponent.maxCommentLength)])
  });

  /** Messages of the last failed attempt that do not belong to a field. */
  alertMessages: string[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  @Input()
  set error(value: ApiError | null) {
    this.alertMessages = !value ? [] : value.isValidation ? applyServerErrors(this.form, value) : [value.message];
  }

  get remaining(): number {
    return this.maxCommentLength - this.form.controls.comment.value.length;
  }

  /** The button follows the decision, so a mistaken click is visible before it is confirmed. */
  get confirmLabel(): string {
    const upheld = this.form.controls.upheld.value;
    return upheld === null ? 'Resolve dispute' : upheld ? 'Uphold the takeback' : 'Cancel the takeback';
  }

  get confirmClass(): string {
    return this.form.controls.upheld.value === false ? 'btn-danger' : 'btn-primary';
  }

  submit(): void {
    if (this.busy) {
      return;
    }
    this.alertMessages = [];
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      focusFirstInvalid(this.host.nativeElement, this.form);
      return;
    }

    const value = this.form.getRawValue();
    if (value.upheld === null) {
      return;
    }
    this.confirmed.emit({ upheld: value.upheld, comment: value.comment.trim() });
  }
}
