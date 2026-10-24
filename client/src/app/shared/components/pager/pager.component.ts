import { Component, EventEmitter, Input, Output } from '@angular/core';

import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../../utils/paging';

let nextPagerId = 0;

/** First / previous / next / last buttons, a page size select and the "Showing x-y of n" summary. */
@Component({
  selector: 'app-pager',
  templateUrl: './pager.component.html'
})
export class PagerComponent {
  @Input() pageNumber = 1;
  @Input() pageSize = DEFAULT_PAGE_SIZE;
  @Input() totalCount = 0;
  /** Provided by the API; derived from the total count when omitted. */
  @Input() totalPages: number | null = null;
  @Input() pageSizes: readonly number[] = PAGE_SIZES;
  @Input() disabled = false;

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  readonly sizeSelectId = `pager-size-${++nextPagerId}`;

  get pageCount(): number {
    const pages = this.totalPages ?? Math.ceil(this.totalCount / Math.max(this.pageSize, 1));
    return Math.max(1, pages);
  }

  get firstItem(): number {
    return this.totalCount === 0 ? 0 : (this.pageNumber - 1) * this.pageSize + 1;
  }

  get lastItem(): number {
    return Math.min(this.pageNumber * this.pageSize, this.totalCount);
  }

  get isFirstPage(): boolean {
    return this.pageNumber <= 1;
  }

  get isLastPage(): boolean {
    return this.pageNumber >= this.pageCount;
  }

  goTo(page: number): void {
    const target = Math.min(Math.max(1, page), this.pageCount);
    if (!this.disabled && target !== this.pageNumber) {
      this.pageChange.emit(target);
    }
  }

  onPageSizeChange(value: string): void {
    const size = Number(value);
    if (Number.isFinite(size) && size > 0 && size !== this.pageSize) {
      this.pageSizeChange.emit(size);
    }
  }
}
