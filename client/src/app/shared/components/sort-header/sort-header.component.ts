import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';

/** Sortable table header: `<th scope="col" appSortHeader="dueDate" [sortBy]="..." (sortChange)="...">Due</th>`. */
@Component({
  selector: 'th[appSortHeader]',
  templateUrl: './sort-header.component.html'
})
export class SortHeaderComponent {
  /** The `sortBy` key this column sorts by. */
  @Input('appSortHeader') key = '';
  @Input() sortBy: string | null = null;
  @Input() sortDescending = false;
  @Output() sortChange = new EventEmitter<string>();

  get active(): boolean {
    return this.sortBy === this.key;
  }

  @HostBinding('attr.aria-sort')
  get ariaSort(): 'ascending' | 'descending' | 'none' {
    if (!this.active) {
      return 'none';
    }
    return this.sortDescending ? 'descending' : 'ascending';
  }

  get iconClass(): string {
    if (!this.active) {
      return 'bi-arrow-down-up text-body-tertiary';
    }
    return this.sortDescending ? 'bi-caret-down-fill' : 'bi-caret-up-fill';
  }
}
