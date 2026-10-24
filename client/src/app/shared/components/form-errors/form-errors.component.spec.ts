import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';

import { queryAll, query } from '../../../testing/test-helpers';
import { FormErrorsComponent } from './form-errors.component';

describe('FormErrorsComponent', () => {
  let control: FormControl<string>;

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [FormErrorsComponent] });
    control = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(5)] });
  });

  function messages(control: FormControl<string>, forId = 'field'): string[] {
    const fixture = TestBed.createComponent(FormErrorsComponent);
    fixture.componentInstance.control = control;
    fixture.componentInstance.label = 'Subject';
    fixture.componentInstance.forId = forId;
    fixture.detectChanges();
    return queryAll(fixture, '[data-field-errors] div').map(item => item.textContent?.trim() ?? '');
  }

  it('stays silent until the control was touched or edited', () => {
    expect(messages(control)).toEqual([]);
  });

  it('shows the required message after the control was touched', () => {
    control.markAsTouched();

    expect(messages(control)).toEqual(['Subject is required.']);
  });

  it('shows the required message after the control was edited and emptied', () => {
    control.setValue('x');
    control.setValue('');
    control.markAsDirty();

    expect(messages(control)).toEqual(['Subject is required.']);
  });

  it('shows the maximum length message', () => {
    control.setValue('too long');
    control.markAsDirty();

    expect(messages(control)).toEqual(['Subject must be at most 5 characters.']);
  });

  it('shows the minimum length message and the numeric limits', () => {
    const short = new FormControl('ab', { nonNullable: true, validators: [Validators.minLength(3)] });
    short.markAsTouched();
    expect(messages(short)).toEqual(['Subject must be at least 3 characters.']);

    const amount = new FormControl<number | null>(0, { validators: [Validators.min(1), Validators.max(-5)] });
    amount.markAsTouched();
    const text = TestBed.createComponent(FormErrorsComponent);
    text.componentInstance.control = amount;
    text.componentInstance.label = 'Amount';
    text.detectChanges();
    expect(queryAll(text, '[data-field-errors] div').map(item => item.textContent)).toEqual([
      'Amount must be at least 1.',
      'Amount must be at most -5.'
    ]);
  });

  it('gives the list an id derived from the input for aria-describedby', () => {
    control.markAsTouched();
    const fixture = TestBed.createComponent(FormErrorsComponent);
    fixture.componentInstance.control = control;
    fixture.componentInstance.forId = 'subject';
    fixture.detectChanges();

    expect(query(fixture, '[data-field-errors]')?.id).toBe('subject-errors');
  });

  it('shows a server message and custom validator messages', () => {
    control.setErrors({ server: 'Subject already exists.', minDate: { message: 'Too early.' }, odd: true });
    control.markAsTouched();

    expect(messages(control)).toEqual(['Subject already exists.', 'Too early.', 'Subject is not valid.']);
  });

  it('renders nothing without a control', () => {
    const fixture = TestBed.createComponent(FormErrorsComponent);
    fixture.detectChanges();

    expect(query(fixture, '[data-field-errors]')).toBeNull();
  });
});
