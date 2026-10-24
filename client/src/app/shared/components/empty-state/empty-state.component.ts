import { Component, Input } from '@angular/core';

/** "Nothing here" message with an optional call to action projected below the text. */
@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.component.html'
})
export class EmptyStateComponent {
  @Input() title = 'Nothing to show';
  @Input() message = '';
  @Input() icon = 'bi-inbox';
}
