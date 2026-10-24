import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, ValidatorFn, Validators } from '@angular/forms';

import { ApiError } from '../../../models/api';
import { applyServerErrors, textOrNull } from '../../utils/form-utils';
import { requiredText } from '../../validators/app-validators';

let nextDialogId = 0;

/**
 * Dialog with one comment box: complete (outcome), cancel (reason), reject, dispute, write off, approve (optional).
 * `confirmed` carries the trimmed comment, or null when the box was left empty.
 */
@Component({
  selector: 'app-comment-dialog',
  templateUrl: './comment-dialog.component.html'
})
export class CommentDialogComponent implements OnInit {
  @Input() title = 'Add a comment';
  @Input() message = '';
  @Input() label = 'Comment';
  @Input() confirmLabel = 'Confirm';
  @Input() confirmClass = 'btn-primary';
  /** Text of the button that closes the dialog without acting ("Keep it" is clearer than "Cancel" for cancel flows). */
  @Input() dismissLabel = 'Cancel';
  @Input() required = false;
  @Input() maxLength: number | null = null;
  @Input() rows = 4;
  @Input() busy = false;

  @Output() confirmed = new EventEmitter<string | null>();
  @Output() cancelled = new EventEmitter<void>();

  readonly dialogId = ++nextDialogId;
  readonly formId = `comment-dialog-form-${this.dialogId}`;
  readonly textareaId = `comment-dialog-text-${this.dialogId}`;

  readonly commentControl = new FormControl<string>('', { nonNullable: true });
  readonly form = this.fb.nonNullable.group({ comment: this.commentControl });

  /** Messages of the last failed attempt that do not belong to the comment box. */
  alertMessages: string[] = [];

  constructor(private readonly fb: FormBuilder) {}

  @Input()
  set error(value: ApiError | null) {
    this.alertMessages = !value ? [] : value.isValidation ? applyServerErrors(this.form, value) : [value.message];
  }

  ngOnInit(): void {
    const validators: ValidatorFn[] = [];
    if (this.required) {
      validators.push(requiredText);
    }
    if (this.maxLength !== null) {
      validators.push(Validators.maxLength(this.maxLength));
    }
    this.commentControl.setValidators(validators);
    this.commentControl.updateValueAndValidity({ emitEvent: false });
  }

  get remaining(): number | null {
    return this.maxLength === null ? null : this.maxLength - this.commentControl.value.length;
  }

  submit(): void {
    this.commentControl.markAsTouched();
    if (this.busy) {
      return;
    }
    if (this.commentControl.invalid) {
      document.getElementById(this.textareaId)?.focus();
      return;
    }
    this.confirmed.emit(textOrNull(this.commentControl.value));
  }
}
