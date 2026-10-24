import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LookupService } from '../../../core/services/lookup.service';
import { createLookupServiceSpy } from '../../../testing/test-doubles';
import { query, textOf } from '../../../testing/test-helpers';
import { SharedModule } from '../../shared.module';
import { EmptyStateComponent } from './empty-state.component';

@Component({
  template: `
    <app-empty-state title="No activities" message="Try other filters." icon="bi-list-check">
      <button type="button" id="cta">New activity</button>
    </app-empty-state>
  `
})
class EmptyStateHostComponent {}

describe('EmptyStateComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [EmptyStateHostComponent],
      providers: [{ provide: LookupService, useValue: createLookupServiceSpy() }]
    });
  });

  it('shows the title, the message, the icon and the projected call to action', () => {
    const fixture = TestBed.createComponent(EmptyStateHostComponent);
    fixture.detectChanges();

    expect(textOf(fixture, '[data-empty-state] h2')).toBe('No activities');
    expect(textOf(fixture, '[data-empty-state] p')).toBe('Try other filters.');
    expect(query(fixture, '[data-empty-state] #cta')).not.toBeNull();
    expect(query(fixture, '[data-empty-state] i')?.classList).toContain('bi-list-check');
  });

  it('has a neutral default title and omits the message paragraph when there is none', () => {
    const fixture = TestBed.createComponent(EmptyStateComponent);
    fixture.detectChanges();

    expect(textOf(fixture, '[data-empty-state] h2')).toBe('Nothing to show');
    expect(query(fixture, '[data-empty-state] p')).toBeNull();
  });
});
