import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Shown instead of a generic toast when the API answers CONCURRENCY: somebody else saved the record first. */
@Component({
  selector: 'app-concurrency-panel',
  templateUrl: './concurrency-panel.component.html'
})
export class ConcurrencyPanelComponent {
  @Input() busy = false;
  @Output() reload = new EventEmitter<void>();
}
