import { Directive, ElementRef, HostBinding, Self } from '@angular/core';
import { NgControl } from '@angular/forms';

import { showError } from '../utils/form-utils';

/**
 * Applied automatically to every native input, select and textarea bound with formControlName: shows the Bootstrap
 * invalid state and wires `aria-invalid` / `aria-describedby` to the `<id>-errors` list of `app-form-errors`.
 */
@Directive({
  selector: 'input[formControlName], select[formControlName], textarea[formControlName]'
})
export class FieldStateDirective {
  constructor(
    @Self() private readonly ngControl: NgControl,
    private readonly element: ElementRef<HTMLElement>
  ) {}

  @HostBinding('class.is-invalid')
  get invalid(): boolean {
    return showError(this.ngControl.control);
  }

  @HostBinding('attr.aria-invalid')
  get ariaInvalid(): 'true' | null {
    return this.invalid ? 'true' : null;
  }

  @HostBinding('attr.aria-describedby')
  get describedBy(): string | null {
    const element = this.element.nativeElement;
    // The error of a radio group belongs to the group (its fieldset), not to each radio button.
    const isRadio = element instanceof HTMLInputElement && element.type === 'radio';
    return this.invalid && element.id && !isRadio ? `${element.id}-errors` : null;
  }
}
