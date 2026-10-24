import { AbstractControl, FormControl, FormGroup, ValidatorFn } from '@angular/forms';

import {
  CLAIM_NUMBER_PATTERN,
  greaterThan,
  maxDecimals,
  maxValueOf,
  minDate,
  notFutureDate,
  notGreaterThanControl,
  notLessThanControl,
  patternWithMessage,
  requiredText
} from './app-validators';

function control(value: unknown): AbstractControl {
  return new FormControl(value);
}

describe('app-validators', () => {
  describe('requiredText', () => {
    it('rejects null, empty and whitespace-only text', () => {
      expect(requiredText(control(null))).toEqual({ required: true });
      expect(requiredText(control(''))).toEqual({ required: true });
      expect(requiredText(control('   '))).toEqual({ required: true });
    });

    it('accepts text and numbers', () => {
      expect(requiredText(control('x'))).toBeNull();
      expect(requiredText(control(0))).toBeNull();
    });
  });

  describe('maxDecimals', () => {
    const validator = maxDecimals(2);

    it('accepts whole numbers and up to two decimals', () => {
      expect(validator(control(12))).toBeNull();
      expect(validator(control(12.5))).toBeNull();
      expect(validator(control('12.34'))).toBeNull();
    });

    it('rejects a third decimal with a readable message', () => {
      const errors = validator(control(1.005));

      expect(errors?.['maxDecimals']).toEqual({ max: 2, message: 'Use at most 2 decimal places.' });
    });

    it('ignores empty values and non-numbers (other validators handle those)', () => {
      expect(validator(control(null))).toBeNull();
      expect(validator(control(''))).toBeNull();
      expect(validator(control('abc'))).toBeNull();
    });

    it('rejects exponential notation', () => {
      expect(validator(control(1e-7))).not.toBeNull();
    });
  });

  describe('greaterThan', () => {
    it('rejects the limit itself and anything below', () => {
      expect(greaterThan(0)(control(0))).not.toBeNull();
      expect(greaterThan(0)(control(-5))).not.toBeNull();
      expect(greaterThan(0)(control(0.01))).toBeNull();
    });

    it('skips empty values', () => {
      expect(greaterThan(0)(control(null))).toBeNull();
    });
  });

  describe('notFutureDate', () => {
    const validator = notFutureDate(() => '2025-06-15');

    it('accepts today and the past', () => {
      expect(validator(control('2025-06-15'))).toBeNull();
      expect(validator(control('2020-01-01'))).toBeNull();
    });

    it('rejects tomorrow', () => {
      const errors = validator(control('2025-06-16'));

      expect(errors?.['notFutureDate']).toEqual({ max: '2025-06-15', message: 'The date cannot be in the future.' });
    });

    it('rejects text that is not a date and ignores empty values', () => {
      expect(validator(control('2025-99-99'))).not.toBeNull();
      expect(validator(control(''))).toBeNull();
      expect(validator(control(null))).toBeNull();
    });

    it('uses the real today by default', () => {
      expect(notFutureDate()(control('2999-01-01'))).not.toBeNull();
      expect(notFutureDate()(control('2000-01-01'))).toBeNull();
    });
  });

  describe('minDate', () => {
    it('accepts the limit and later dates', () => {
      expect(minDate('2025-06-15')(control('2025-06-15'))).toBeNull();
      expect(minDate('2025-06-15')(control('2025-07-01'))).toBeNull();
    });

    it('rejects earlier dates with the default or a custom message', () => {
      expect(minDate('2025-06-15')(control('2025-06-14'))?.['minDate']).toEqual({
        min: '2025-06-15',
        message: 'The date cannot be in the past.'
      });
      expect(minDate('2025-06-15', limit => `Not before ${limit}.`)(control('2025-01-01'))?.['minDate']).toEqual({
        min: '2025-06-15',
        message: 'Not before 2025-06-15.'
      });
    });

    it('evaluates a function limit at validation time', () => {
      let limit = '2025-01-01';
      const validator = minDate(() => limit);

      expect(validator(control('2025-02-01'))).toBeNull();
      limit = '2025-03-01';
      expect(validator(control('2025-02-01'))).not.toBeNull();
    });

    it('ignores empty values', () => {
      expect(minDate('2025-06-15')(control(''))).toBeNull();
    });
  });

  describe('maxValueOf', () => {
    it('compares against the live maximum', () => {
      let max: number | null = 100;
      const validator = maxValueOf(() => max, limit => `At most ${limit}.`);

      expect(validator(control(100))).toBeNull();
      expect(validator(control(100.01))?.['maxValueOf']).toEqual({ max: 100, message: 'At most 100.' });
      max = 200;
      expect(validator(control(150))).toBeNull();
    });

    it('is disabled while the maximum is unknown', () => {
      expect(maxValueOf(() => null, () => 'x')(control(1_000_000))).toBeNull();
    });
  });

  describe('sibling comparisons', () => {
    type SiblingValidator = (other: string, message: string) => ValidatorFn;

    /** The control under test gets its parent only after it was built, so it has to be validated once more. */
    function pair(first: unknown, second: unknown, validator: SiblingValidator): FormGroup {
      const form = new FormGroup({
        limit: new FormControl(first),
        value: new FormControl(second, [validator('limit', 'Message.')])
      });
      form.get('value')?.updateValueAndValidity();
      return form;
    }

    it('notGreaterThanControl accepts equal and smaller values', () => {
      expect(pair(100, 100, notGreaterThanControl).get('value')?.errors).toBeNull();
      expect(pair(100, 99.99, notGreaterThanControl).get('value')?.errors).toBeNull();
    });

    it('notGreaterThanControl rejects a larger value and carries the message', () => {
      const errors = pair(100, 100.5, notGreaterThanControl).get('value')?.errors;

      expect(errors?.['notGreaterThanControl']).toEqual({ other: 'limit', message: 'Message.' });
    });

    it('notGreaterThanControl is quiet while either side is empty', () => {
      expect(pair(null, 5, notGreaterThanControl).get('value')?.errors).toBeNull();
      expect(pair(5, null, notGreaterThanControl).get('value')?.errors).toBeNull();
    });

    it('notLessThanControl compares numbers and yyyy-MM-dd text', () => {
      expect(pair(10, 9, notLessThanControl).get('value')?.errors?.['notLessThanControl']).toBeDefined();
      expect(pair(10, 10, notLessThanControl).get('value')?.errors).toBeNull();
      expect(pair('2025-03-02', '2025-03-01', notLessThanControl).get('value')?.errors).not.toBeNull();
      expect(pair('2025-03-02', '2025-03-03', notLessThanControl).get('value')?.errors).toBeNull();
    });

    it('can be revalidated after the sibling control changed', () => {
      const form = pair(100, 150, notGreaterThanControl);
      expect(form.get('value')?.invalid).toBeTrue();

      form.get('limit')?.setValue(200);
      form.get('value')?.updateValueAndValidity();

      expect(form.get('value')?.valid).toBeTrue();
    });
  });

  describe('patternWithMessage', () => {
    const validator = patternWithMessage(CLAIM_NUMBER_PATTERN, 'Letters, digits and dashes only.');

    it('accepts claim numbers made of letters, digits and dashes', () => {
      expect(validator(control('CLM-2025-0042'))).toBeNull();
      expect(validator(control('abc123'))).toBeNull();
    });

    it('rejects anything else and explains why', () => {
      expect(validator(control('CLM 42'))?.['pattern']).toEqual(
        jasmine.objectContaining({ message: 'Letters, digits and dashes only.' })
      );
      expect(validator(control('CLM/42'))).not.toBeNull();
    });

    it('ignores blanks around the text, which are trimmed before it is sent', () => {
      expect(validator(control('  CLM-42 '))).toBeNull();
      expect(validator(control(' CLM 42 '))).not.toBeNull();
    });

    it('ignores empty and blank values, which are the business of the required rule', () => {
      expect(validator(control(''))).toBeNull();
      expect(validator(control('   '))).toBeNull();
    });
  });
});
