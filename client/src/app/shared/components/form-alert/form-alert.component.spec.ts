import { TestBed } from '@angular/core/testing';

import { query, queryAll, textOf } from '../../../testing/test-helpers';
import { FormAlertComponent } from './form-alert.component';

describe('FormAlertComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [FormAlertComponent] });
  });

  it('is not rendered without messages', () => {
    const fixture = TestBed.createComponent(FormAlertComponent);
    fixture.detectChanges();

    expect(query(fixture, '[data-form-alert]')).toBeNull();
  });

  it('lists the messages in an alert', () => {
    const fixture = TestBed.createComponent(FormAlertComponent);
    fixture.componentInstance.messages = ['First problem.', 'Second problem.'];
    fixture.detectChanges();

    expect(query(fixture, '[data-form-alert]')?.getAttribute('role')).toBe('alert');
    expect(queryAll(fixture, '[data-form-alert] li').map(item => item.textContent)).toEqual(['First problem.', 'Second problem.']);
    expect(textOf(fixture, '[data-form-alert] p')).toBe('The request could not be completed');
  });

  it('accepts another title', () => {
    const fixture = TestBed.createComponent(FormAlertComponent);
    fixture.componentInstance.title = 'Please fix these problems';
    fixture.componentInstance.messages = ['x'];
    fixture.detectChanges();

    expect(textOf(fixture, '[data-form-alert] p')).toBe('Please fix these problems');
  });
});
