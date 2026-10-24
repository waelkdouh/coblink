import { Component, Input } from '@angular/core';

/** Alert at the top of a form for messages that belong to no single field (server answers, business rules). */
@Component({
  selector: 'app-form-alert',
  templateUrl: './form-alert.component.html'
})
export class FormAlertComponent {
  @Input() messages: readonly string[] = [];
  @Input() title = 'The request could not be completed';
}
