import { AbstractControl, FormGroup } from '@angular/forms';

import { ApiError } from '../../models/api';

/** A control shows its errors once the user has touched or changed it (or the form was submitted). */
export function showError(control: AbstractControl | null | undefined): boolean {
  return !!control && control.invalid && (control.touched || control.dirty);
}

function findControl(form: AbstractControl, field: string): AbstractControl | null {
  const exact = form.get(field);
  if (exact) {
    return exact;
  }
  const controls = (form as FormGroup).controls as Record<string, AbstractControl> | undefined;
  if (!controls) {
    return null;
  }
  const match = Object.keys(controls).find(name => name.toLowerCase() === field.toLowerCase());
  return match ? controls[match] : null;
}

/**
 * Puts the server's validation messages on the controls they belong to (`setErrors({ server: message })`, the error
 * disappears as soon as the user edits the control). Returns the messages that could not be placed on a control:
 * they are shown in the alert at the top of the form.
 */
export function applyServerErrors(form: AbstractControl, error: ApiError): string[] {
  const unmapped: string[] = [...error.generalErrors()];
  const byField = error.fieldErrors();
  let mapped = 0;

  for (const field of Object.keys(byField)) {
    const messages = byField[field];
    const control = findControl(form, field);
    if (control) {
      control.setErrors({ server: messages.join(' ') });
      control.markAsTouched();
      mapped++;
    } else {
      unmapped.push(...messages);
    }
  }

  if (unmapped.length === 0 && mapped === 0) {
    unmapped.push(error.message);
  }
  return unmapped;
}

/** Moves the keyboard focus to the first invalid control of a form (document order). */
export function focusFirstInvalid(root: HTMLElement, form: FormGroup): void {
  const hosts = Array.from(root.querySelectorAll<HTMLElement>('[formControlName]'));
  for (const host of hosts) {
    const name = host.getAttribute('formControlName');
    const control = name ? form.get(name) : null;
    if (control && control.invalid) {
      const target = host.matches('input, select, textarea, button')
        ? host
        : host.querySelector<HTMLElement>('input, select, textarea, button');
      if (target) {
        target.focus();
        return;
      }
    }
  }
}

/** Trimmed text, or null when the control is empty (the API stores NULL, not empty strings). */
export function textOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** A number from a number input (which yields number | null) or null when empty. */
export function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
