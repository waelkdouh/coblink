import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { queryAll } from '../../../testing/test-helpers';
import { SortHeaderComponent } from './sort-header.component';

@Component({
  template: `
    <table>
      <thead>
        <tr>
          <th scope="col" appSortHeader="subject" [sortBy]="sortBy" [sortDescending]="descending" (sortChange)="sorted = $event">Subject</th>
          <th scope="col" appSortHeader="dueDate" [sortBy]="sortBy" [sortDescending]="descending" (sortChange)="sorted = $event">Due</th>
        </tr>
      </thead>
    </table>
  `
})
class SortHeaderHostComponent {
  sortBy: string | null = 'subject';
  descending = false;
  sorted = '';
}

describe('SortHeaderComponent', () => {
  let fixture: ComponentFixture<SortHeaderHostComponent>;
  let host: SortHeaderHostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [SortHeaderComponent, SortHeaderHostComponent] });
    fixture = TestBed.createComponent(SortHeaderHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function header(name: string): HTMLElement {
    return queryAll(fixture, 'th').find(th => th.textContent?.includes(name)) as HTMLElement;
  }

  it('marks the sorted column with aria-sort and an arrow', () => {
    expect(header('Subject').getAttribute('aria-sort')).toBe('ascending');
    expect(header('Subject').querySelector('.bi-caret-up-fill')).not.toBeNull();
  });

  it('shows a descending arrow when the sort is descending', () => {
    host.descending = true;
    fixture.detectChanges();

    expect(header('Subject').getAttribute('aria-sort')).toBe('descending');
    expect(header('Subject').querySelector('.bi-caret-down-fill')).not.toBeNull();
  });

  it('leaves the other columns neutral', () => {
    expect(header('Due').getAttribute('aria-sort')).toBe('none');
    expect(header('Due').querySelector('.bi-arrow-down-up')).not.toBeNull();
  });

  it('emits the sort key of the clicked column', () => {
    (header('Due').querySelector('button') as HTMLButtonElement).click();

    expect(host.sorted).toBe('dueDate');
  });

  it('keeps the column title as button text', () => {
    expect(header('Subject').querySelector('button')?.textContent).toContain('Subject');
  });
});
