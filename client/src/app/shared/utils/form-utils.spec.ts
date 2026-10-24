import { FormControl, FormGroup } from '@angular/forms';
import { convertToParamMap } from '@angular/router';

import { ApiError } from '../../models/api';
import { ActivityStatus } from '../../models/enums';
import { applyServerErrors, focusFirstInvalid, numberOrNull, showError, textOrNull } from './form-utils';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, toggleSort } from './paging';
import {
  numericEnumValues,
  readBoolean,
  readChoice,
  readDate,
  readDecimal,
  readEnum,
  readInt,
  readPositiveInt,
  readText
} from './query-utils';

describe('form-utils', () => {
  describe('showError', () => {
    it('shows errors only once the control was touched or edited', () => {
      const control = new FormControl('', { nonNullable: true });
      control.setErrors({ required: true });

      expect(showError(control)).toBeFalse();
      control.markAsTouched();
      expect(showError(control)).toBeTrue();
    });

    it('does not show anything for a valid control or no control', () => {
      const control = new FormControl('ok');
      control.markAsTouched();

      expect(showError(control)).toBeFalse();
      expect(showError(null)).toBeFalse();
      expect(showError(undefined)).toBeFalse();
    });
  });

  describe('applyServerErrors', () => {
    function buildForm(): FormGroup {
      return new FormGroup({ subject: new FormControl(''), dueDate: new FormControl(''), claimNumber: new FormControl('') });
    }

    it('puts field messages on the matching controls, ignoring the case of the field name', () => {
      const form = buildForm();
      const error = new ApiError(200, 'VALIDATION', 'Invalid.', [
        { field: 'subject', message: 'Subject is required.' },
        { field: 'DueDate', message: 'Due date is in the past.' },
        { field: 'subject', message: 'Subject is too short.' }
      ]);

      const unmapped = applyServerErrors(form, error);

      expect(unmapped).toEqual([]);
      expect(form.get('subject')?.errors).toEqual({ server: 'Subject is required. Subject is too short.' });
      expect(form.get('dueDate')?.errors).toEqual({ server: 'Due date is in the past.' });
      expect(form.get('subject')?.touched).toBeTrue();
    });

    it('returns general messages and messages for unknown fields', () => {
      const form = buildForm();
      const error = new ApiError(200, 'VALIDATION', 'Invalid.', [
        { field: null, message: 'Something general.' },
        { field: 'nonsense', message: 'Not on this form.' }
      ]);

      expect(applyServerErrors(form, error)).toEqual(['Something general.', 'Not on this form.']);
    });

    it('falls back to the error message when the server listed nothing', () => {
      expect(applyServerErrors(buildForm(), new ApiError(200, 'BUSINESS_RULE', 'Not allowed in this status.'))).toEqual([
        'Not allowed in this status.'
      ]);
    });

    it('the server error disappears when the user edits the control', () => {
      const form = buildForm();
      applyServerErrors(form, new ApiError(200, 'VALIDATION', 'Invalid.', [{ field: 'subject', message: 'Taken.' }]));
      expect(form.get('subject')?.invalid).toBeTrue();

      form.get('subject')?.setValue('Another');

      expect(form.get('subject')?.valid).toBeTrue();
    });
  });

  describe('focusFirstInvalid', () => {
    it('focuses the first invalid control in document order', () => {
      const host = document.createElement('div');
      host.innerHTML = '<input formControlName="a"><input formControlName="b"><div formControlName="c"><input id="inner"></div>';
      document.body.appendChild(host);
      const form = new FormGroup({
        a: new FormControl('ok'),
        b: new FormControl(''),
        c: new FormControl('')
      });
      form.get('b')?.setErrors({ required: true });
      form.get('c')?.setErrors({ required: true });

      focusFirstInvalid(host, form);

      expect(document.activeElement).toBe(host.querySelector('[formControlName="b"]'));
      host.remove();
    });

    it('descends into a custom control host to find the real input', () => {
      const host = document.createElement('div');
      host.innerHTML = '<div formControlName="c"><input id="inner"></div>';
      document.body.appendChild(host);
      const form = new FormGroup({ c: new FormControl('') });
      form.get('c')?.setErrors({ required: true });

      focusFirstInvalid(host, form);

      expect(document.activeElement?.id).toBe('inner');
      host.remove();
    });
  });

  describe('textOrNull and numberOrNull', () => {
    it('trim text and turn blanks into null', () => {
      expect(textOrNull('  hello ')).toBe('hello');
      expect(textOrNull('   ')).toBeNull();
      expect(textOrNull(null)).toBeNull();
      expect(textOrNull(undefined)).toBeNull();
    });

    it('turn empty and invalid numbers into null', () => {
      expect(numberOrNull(12.5)).toBe(12.5);
      expect(numberOrNull('7')).toBe(7);
      expect(numberOrNull(0)).toBe(0);
      expect(numberOrNull('')).toBeNull();
      expect(numberOrNull(null)).toBeNull();
      expect(numberOrNull('abc')).toBeNull();
    });
  });
});

describe('paging', () => {
  it('offers the page sizes of the contract with a default of 20', () => {
    expect(PAGE_SIZES).toEqual([10, 20, 50, 100]);
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  it('toggleSort flips the direction of the active column', () => {
    expect(toggleSort({ sortBy: 'dueDate', sortDescending: false }, 'dueDate')).toEqual({ sortBy: 'dueDate', sortDescending: true });
    expect(toggleSort({ sortBy: 'dueDate', sortDescending: true }, 'dueDate')).toEqual({ sortBy: 'dueDate', sortDescending: false });
  });

  it('toggleSort starts another column ascending', () => {
    expect(toggleSort({ sortBy: 'dueDate', sortDescending: true }, 'subject')).toEqual({ sortBy: 'subject', sortDescending: false });
  });
});

describe('query-utils', () => {
  const params = convertToParamMap({
    text: '  hello  ',
    int: '42',
    negative: '-3',
    decimal: '12.50',
    bad: 'abc',
    zero: '0',
    yes: 'TRUE',
    no: '0',
    status: '2',
    date: '2025-03-14',
    choice: 'dueDate'
  });

  it('readText trims and defaults to an empty string', () => {
    expect(readText(params, 'text')).toBe('hello');
    expect(readText(params, 'missing')).toBe('');
  });

  it('readInt accepts whole numbers only', () => {
    expect(readInt(params, 'int')).toBe(42);
    expect(readInt(params, 'negative')).toBe(-3);
    expect(readInt(params, 'decimal')).toBeNull();
    expect(readInt(params, 'bad')).toBeNull();
    expect(readInt(params, 'missing')).toBeNull();
  });

  it('readPositiveInt falls back for zero, negative and invalid values', () => {
    expect(readPositiveInt(params, 'int', 1)).toBe(42);
    expect(readPositiveInt(params, 'zero', 1)).toBe(1);
    expect(readPositiveInt(params, 'negative', 1)).toBe(1);
    expect(readPositiveInt(params, 'bad', 7)).toBe(7);
  });

  it('readDecimal reads money filters', () => {
    expect(readDecimal(params, 'decimal')).toBe(12.5);
    expect(readDecimal(params, 'bad')).toBeNull();
    expect(readDecimal(params, 'missing')).toBeNull();
  });

  it('readBoolean understands true/false/1/0 and uses the fallback otherwise', () => {
    expect(readBoolean(params, 'yes', false)).toBeTrue();
    expect(readBoolean(params, 'no', true)).toBeFalse();
    expect(readBoolean(params, 'missing', true)).toBeTrue();
    expect(readBoolean(params, 'bad', false)).toBeFalse();
  });

  it('readEnum accepts only the allowed numeric values', () => {
    const allowed = numericEnumValues<ActivityStatus>(ActivityStatus);

    expect(allowed).toEqual([ActivityStatus.Open, ActivityStatus.InProgress, ActivityStatus.Completed, ActivityStatus.Cancelled]);
    expect(readEnum(params, 'status', allowed)).toBe(ActivityStatus.InProgress);
    expect(readEnum(params, 'int', allowed)).toBeNull();
    expect(readEnum(params, 'missing', allowed)).toBeNull();
  });

  it('readDate returns a real yyyy-MM-dd date or an empty string', () => {
    expect(readDate(params, 'date')).toBe('2025-03-14');
    expect(readDate(params, 'bad')).toBe('');
  });

  it('readChoice accepts only listed strings', () => {
    expect(readChoice(params, 'choice', ['dueDate', 'subject'] as const)).toBe('dueDate');
    expect(readChoice(params, 'text', ['dueDate', 'subject'] as const)).toBeNull();
  });
});
