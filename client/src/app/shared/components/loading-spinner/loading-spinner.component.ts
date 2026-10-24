import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  template: `
    <div class="text-center text-body-secondary py-4" role="status">
      <span class="spinner-border spinner-border-sm text-primary me-2" aria-hidden="true"></span>{{ label }}
    </div>
  `
})
export class LoadingSpinnerComponent {
  @Input() label = 'Loading...';
}
