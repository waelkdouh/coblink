import { ComponentFixture, TestBed } from '@angular/core/testing';

import { click, query, queryAll, setValue, textOf } from '../../../testing/test-helpers';
import { PagerComponent } from './pager.component';

describe('PagerComponent', () => {
  let fixture: ComponentFixture<PagerComponent>;
  let pager: PagerComponent;
  let pages: number[];
  let sizes: number[];

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [PagerComponent] });
    fixture = TestBed.createComponent(PagerComponent);
    pager = fixture.componentInstance;
    pages = [];
    sizes = [];
    pager.pageChange.subscribe((page: number) => pages.push(page));
    pager.pageSizeChange.subscribe((size: number) => sizes.push(size));
  });

  function show(pageNumber: number, pageSize: number, totalCount: number, totalPages: number | null = null): void {
    pager.pageNumber = pageNumber;
    pager.pageSize = pageSize;
    pager.totalCount = totalCount;
    pager.totalPages = totalPages;
    fixture.detectChanges();
  }

  function button(name: 'first' | 'previous' | 'next' | 'last'): HTMLButtonElement {
    return query<HTMLButtonElement>(fixture, `[data-pager="${name}"]`) as HTMLButtonElement;
  }

  it('summarises the visible range', () => {
    show(2, 20, 45);

    expect(textOf(fixture, '[role="status"]')).toBe('Showing 21-40 of 45');
    expect(textOf(fixture, '[data-pager="position"]')).toBe('Page 2 of 3');
  });

  it('clips the last range to the total', () => {
    show(3, 20, 45);

    expect(textOf(fixture, '[role="status"]')).toBe('Showing 41-45 of 45');
  });

  it('says so when there are no results', () => {
    show(1, 20, 0);

    expect(textOf(fixture, '[role="status"]')).toBe('No results');
    expect(textOf(fixture, '[data-pager="position"]')).toBe('Page 1 of 1');
  });

  it('disables first/previous on the first page and next/last on the last page', () => {
    show(1, 10, 30);
    expect([button('first').disabled, button('previous').disabled, button('next').disabled, button('last').disabled]).toEqual([
      true,
      true,
      false,
      false
    ]);

    show(3, 10, 30);
    expect([button('first').disabled, button('previous').disabled, button('next').disabled, button('last').disabled]).toEqual([
      false,
      false,
      true,
      true
    ]);
  });

  it('emits the requested page for each navigation button', () => {
    show(2, 10, 50);

    click(fixture, '[data-pager="first"]');
    click(fixture, '[data-pager="previous"]');
    click(fixture, '[data-pager="next"]');
    click(fixture, '[data-pager="last"]');

    expect(pages).toEqual([1, 1, 3, 5]);
  });

  it('prefers the page count of the API over its own arithmetic', () => {
    show(1, 10, 25, 7);

    expect(textOf(fixture, '[data-pager="position"]')).toBe('Page 1 of 7');
  });

  it('never emits a page outside the range or the current page', () => {
    show(1, 10, 25);

    pager.goTo(0);
    pager.goTo(1);
    pager.goTo(99);

    expect(pages).toEqual([3]);
  });

  it('offers the page sizes 10, 20, 50 and 100 and selects the current one', () => {
    show(1, 50, 200);

    const options = queryAll<HTMLOptionElement>(fixture, 'select option');
    expect(options.map(option => option.textContent?.trim())).toEqual(['10', '20', '50', '100']);
    expect((query(fixture, 'select') as HTMLSelectElement).value).toBe('50');
  });

  it('emits the new page size', () => {
    show(1, 20, 200);

    setValue(fixture, 'select', '100');

    expect(sizes).toEqual([100]);
  });

  it('does not emit when the same page size is chosen again', () => {
    show(1, 20, 200);

    pager.onPageSizeChange('20');
    pager.onPageSizeChange('abc');

    expect(sizes).toEqual([]);
  });

  it('is inert while disabled', () => {
    pager.disabled = true;
    show(2, 10, 50);

    expect(button('next').disabled).toBeTrue();
    expect((query(fixture, 'select') as HTMLSelectElement).disabled).toBeTrue();
    pager.goTo(3);
    expect(pages).toEqual([]);
  });

  it('labels the page size select', () => {
    show(1, 20, 20);

    const select = query<HTMLSelectElement>(fixture, 'select') as HTMLSelectElement;
    const label = query<HTMLLabelElement>(fixture, `label[for="${select.id}"]`);
    expect(label?.textContent).toContain('Rows per page');
  });
});
