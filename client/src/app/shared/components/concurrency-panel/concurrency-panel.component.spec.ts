import { TestBed } from '@angular/core/testing';

import { click, query, textOf } from '../../../testing/test-helpers';
import { ConcurrencyPanelComponent } from './concurrency-panel.component';

describe('ConcurrencyPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [ConcurrencyPanelComponent] });
  });

  it('explains that somebody else changed the record', () => {
    const fixture = TestBed.createComponent(ConcurrencyPanelComponent);
    fixture.detectChanges();

    expect(query(fixture, '[data-concurrency-panel]')?.getAttribute('role')).toBe('alert');
    expect(textOf(fixture, '[data-concurrency-panel]')).toContain('This record was changed by another user');
  });

  it('emits reload when the Reload button is clicked', () => {
    const fixture = TestBed.createComponent(ConcurrencyPanelComponent);
    let reloads = 0;
    fixture.componentInstance.reload.subscribe(() => reloads++);
    fixture.detectChanges();

    click(fixture, '[data-concurrency-panel] button');

    expect(reloads).toBe(1);
  });

  it('disables the Reload button while reloading', () => {
    const fixture = TestBed.createComponent(ConcurrencyPanelComponent);
    fixture.componentInstance.busy = true;
    fixture.detectChanges();

    expect((query(fixture, '[data-concurrency-panel] button') as HTMLButtonElement).disabled).toBeTrue();
    expect(query(fixture, '[data-concurrency-panel] .spinner-border')).not.toBeNull();
  });
});
