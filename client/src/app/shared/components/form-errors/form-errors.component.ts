import { Component, Input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

import { showError } from '../../utils/form-utils';

interface LengthError {
  requiredLength: number;
}

interface MinError {
  min: number;
}

interface MaxError {
  max: number;
}

/** Field level messages for a form control; visible once the control was touched or changed. */
@Component({
  selector: 'app-form-errors',
  templateUrl: './form-errors.component.html'
})
export class FormErrorsComponent {
  @Input() control: AbstractControl | null = null;
  /** Name of the field used in the generated messages ("Subject is required."). */
  @Input() label = 'This field';
  /** id of the input: the message list gets the id `<forId>-errors` for aria-describedby. */
  @Input() forId = '';

  get errorsId(): string | null {
    return this.forId ? `${this.forId}-errors` : null;
  }

  get messages(): string[] {
    const errors = this.control?.errors;
    if (!showError(this.control) || !errors) {
      return [];
    }
    return Object.keys(errors).map(key => this.messageFor(key, errors[key] as unknown));
  }

  private messageFor(key: string, payload: unknown): string {
    switch (key) {
      case 'required':
        return `${this.label} is required.`;
      case 'maxlength':
        return `${this.label} must be at most ${(payload as LengthError).requiredLength} characters.`;
      case 'minlength':
        return `${this.label} must be at least ${(payload as LengthError).requiredLength} characters.`;
      case 'min':
        return `${this.label} must be at least ${(payload as MinError).min}.`;
      case 'max':
        return `${this.label} must be at most ${(payload as MaxError).max}.`;
      case 'server':
        return typeof payload === 'string' ? payload : `${this.label} is not valid.`;
      default: {
        const message = (payload as { message?: unknown } | null)?.message;
        return typeof message === 'string' ? message : `${this.label} is not valid.`;
      }
    }
  }
}
