import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

import { parseCalendarDate, todayIso } from '../utils/date-utils';

/*
 * Client-side validators mirror the field rules of docs/api-reference.md (sections 3 and 4) for fast feedback only.
 * The server stays the authority. Every error payload carries a `message` that FormErrorsComponent can display.
 */

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Like Validators.required, but also rejects whitespace-only text. */
export function requiredText(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { required: true };
  }
  return null;
}

/** At most `max` decimal places (money has two). Empty values are ignored. */
export function maxDecimals(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (isEmpty(control.value)) {
      return null;
    }
    const value = Number(control.value);
    if (!Number.isFinite(value)) {
      return null;
    }
    const decimals = (String(value).split('.')[1] ?? '').length;
    const isExponential = /e/i.test(String(value));
    if (isExponential || decimals > max) {
      return { maxDecimals: { max, message: `Use at most ${max} decimal places.` } };
    }
    return null;
  };
}

/** The number must be greater than `min` (Validators.min allows the limit itself). */
export function greaterThan(min: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (isEmpty(control.value)) {
      return null;
    }
    const value = Number(control.value);
    return Number.isFinite(value) && value > min ? null : { greaterThan: { min, message: `Must be greater than ${min}.` } };
  };
}

/** A date input value (`yyyy-MM-dd`) that is not after today. */
export function notFutureDate(today: () => string = todayIso): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;
    if (isEmpty(value)) {
      return null;
    }
    const limit = today();
    const date = parseCalendarDate(value);
    if (!date || (value as string).slice(0, 10) > limit) {
      return { notFutureDate: { max: limit, message: 'The date cannot be in the future.' } };
    }
    return null;
  };
}

/**
 * A date input value (`yyyy-MM-dd`) that is not before `min` (a date, or a function that returns it, for example
 * today). `message` may be a function of the limit when the text should mention it.
 */
export function minDate(min: string | (() => string), message: string | ((limit: string) => string) = 'The date cannot be in the past.'): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;
    if (isEmpty(value)) {
      return null;
    }
    const limit = typeof min === 'function' ? min() : min;
    const date = parseCalendarDate(value);
    if (!date || (value as string).slice(0, 10) < limit) {
      return { minDate: { min: limit, message: typeof message === 'function' ? message(limit) : message } };
    }
    return null;
  };
}

/** The value may not exceed the (live) maximum returned by `getMax`; a null maximum disables the check. */
export function maxValueOf(getMax: () => number | null, message: (max: number) => string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (isEmpty(control.value)) {
      return null;
    }
    const max = getMax();
    const value = Number(control.value);
    if (max === null || !Number.isFinite(value) || value <= max) {
      return null;
    }
    return { maxValueOf: { max, message: message(max) } };
  };
}

/** The value may not be greater than the value of a sibling control (for example takeback <= original paid). */
export function notGreaterThanControl(otherName: string, message: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const other = control.parent?.get(otherName);
    if (isEmpty(control.value) || !other || isEmpty(other.value)) {
      return null;
    }
    const value = Number(control.value);
    const limit = Number(other.value);
    if (!Number.isFinite(value) || !Number.isFinite(limit) || value <= limit) {
      return null;
    }
    return { notGreaterThanControl: { other: otherName, message } };
  };
}

/**
 * The value may not be smaller than the value of a sibling control (a "to" field against its "from" field).
 * Works for numbers and for `yyyy-MM-dd` strings, which sort correctly as text.
 */
export function notLessThanControl(otherName: string, message: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const other = control.parent?.get(otherName);
    if (isEmpty(control.value) || !other || isEmpty(other.value)) {
      return null;
    }
    const isLess =
      typeof control.value === 'number' && typeof other.value === 'number'
        ? control.value < other.value
        : String(control.value) < String(other.value);
    return isLess ? { notLessThanControl: { other: otherName, message } } : null;
  };
}

/**
 * Regular expression rule with a readable message (Validators.pattern only reports the expression). Blanks around the
 * text are ignored because forms trim text before they send it; blank text is left to the required rule.
 */
export function patternWithMessage(pattern: RegExp, message: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const text = isEmpty(control.value) ? '' : String(control.value).trim();
    if (text === '') {
      return null;
    }
    return pattern.test(text) ? null : { pattern: { requiredPattern: pattern.source, message } };
  };
}

/** Claim numbers: letters, digits and dashes (docs/api-reference.md section 4). */
export const CLAIM_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;
