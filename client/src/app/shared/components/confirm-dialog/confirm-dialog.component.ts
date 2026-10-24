import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ApiError } from '../../../models/api';

/** "Are you sure?" dialog. Extra explanation can be projected between the message and the buttons. */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html'
})
export class ConfirmDialogComponent {
  @Input() title = 'Please confirm';
  @Input() message = '';
  @Input() confirmLabel = 'Confirm';
  /** Bootstrap button colour class of the confirm button. */
  @Input() confirmClass = 'btn-primary';
  /** Text of the button that closes the dialog without acting. */
  @Input() dismissLabel = 'Cancel';
  /** True while the request runs: the buttons are disabled so the action cannot be sent twice. */
  @Input() busy = false;
  /** Failure of the last attempt; the dialog stays open so the user can read it. */
  @Input() error: ApiError | null = null;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
}
