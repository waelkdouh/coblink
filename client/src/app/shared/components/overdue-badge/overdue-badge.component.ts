import { Component, Input } from '@angular/core';

/** The red "Overdue" badge; renders nothing when the record is not overdue. */
@Component({
  selector: 'app-overdue-badge',
  template: `<span *ngIf="overdue" class="badge text-bg-danger"><i class="bi bi-exclamation-circle me-1" aria-hidden="true"></i>Overdue</span>`
})
export class OverdueBadgeComponent {
  @Input() overdue: boolean | null | undefined = false;
}
