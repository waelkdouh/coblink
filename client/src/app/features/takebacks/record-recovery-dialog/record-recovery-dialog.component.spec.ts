import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LookupService } from '../../../core/services/lookup.service';
import { ApiError } from '../../../models/api';
import { RecoveryMethod, TakebackStatus } from '../../../models/enums';
import { Takeback } from '../../../models/models';
import { addDaysIso, todayIso } from '../../../shared/utils/date-utils';
import { SharedModule } from '../../../shared/shared.module';
import { buildTakeback } from '../../../testing/test-data';
import { apiError, createLookupServiceSpy } from '../../../testing/test-doubles';
import { click, keydown, query, queryAll, selectOption, setValue, submit, textOf } from '../../../testing/test-helpers';
import { RecordRecoveryDialogComponent, RecoveryFormValue } from './record-recovery-dialog.component';

@Component({
  template: `
    <app-record-recovery-dialog
      [takeback]="takeback"
      [busy]="busy"
      [error]="error"
      (confirmed)="confirmedWith.push($event)"
      (cancelled)="cancelledCount = cancelledCount + 1"
    ></app-record-recovery-dialog>
  `
})
class RecordRecoveryHostComponent {
  takeback: Takeback = buildTakeback({
    status: TakebackStatus.NoticeSent,
    noticeDate: '2025-03-01T00:00:00',
    dueDate: '2025-04-15T00:00:00',
    takebackAmount: 1000,
    recoveredAmount: 250,
    outstandingAmount: 750
  });
  busy = false;
  error: ApiError | null = null;
  confirmedWith: RecoveryFormValue[] = [];
  cancelledCount = 0;
}

describe('RecordRecoveryDialogComponent', () => {
  let fixture: ComponentFixture<RecordRecoveryHostComponent>;
  let host: RecordRecoveryHostComponent;

  function create(configure: (component: RecordRecoveryHostComponent) => void = () => undefined): void {
    fixture = TestBed.createComponent(RecordRecoveryHostComponent);
    host = fixture.componentInstance;
    configure(host);
    fixture.detectChanges();
  }

  function dialog(): RecordRecoveryDialogComponent {
    return fixture.debugElement.children[0].componentInstance as RecordRecoveryDialogComponent;
  }

  function errorsOf(controlId: string): string {
    return textOf(fixture, `#${controlId}-errors`);
  }

  function confirm(): void {
    click(fixture, '[data-dialog-confirm]');
  }

  function value(selector: string): string {
    return query<HTMLInputElement | HTMLTextAreaElement>(fixture, selector)?.value ?? '';
  }

  /** The minimum for a valid recovery: an amount and a method that needs no reference. */
  function fillValidRecovery(): void {
    setValue(fixture, '#recovery-amount', '250.5');
    selectOption(fixture, '#recovery-method', 'Offset');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [RecordRecoveryDialogComponent, RecordRecoveryHostComponent],
      providers: [{ provide: LookupService, useValue: createLookupServiceSpy() }]
    });
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('the form', () => {
    beforeEach(() => create());

    it('is a dialog titled "Record recovery"', () => {
      expect(query(fixture, '[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
      expect(textOf(fixture, '.modal-title')).toBe('Record recovery');
    });

    it('reminds the user of the outstanding balance', () => {
      expect(textOf(fixture, '[data-recovery-summary]')).toBe('Outstanding balance $750.00 of $1,000.00.');
    });

    it('offers the recovery methods of the lookups', () => {
      const labels = queryAll<HTMLOptionElement>(fixture, '#recovery-method option').map(option => (option.textContent ?? '').trim());

      expect(labels).toEqual(['Select a method', 'Check', 'EFT', 'Offset']);
    });

    it('starts with today as the recovery date and nothing else filled in', () => {
      expect(value('#recovery-date')).toBe(todayIso());
      expect(value('#recovery-amount')).toBe('');
      expect(value('#recovery-reference')).toBe('');
      expect(dialog().form.controls.method.value).toBeNull();
    });

    it('labels every field', () => {
      for (const id of ['recovery-amount', 'recovery-date', 'recovery-method', 'recovery-reference', 'recovery-notes']) {
        expect(query(fixture, `label[for="${id}"]`)).withContext(id).not.toBeNull();
      }
    });

    it('shows what is missing and records nothing when Record recovery is pressed on an empty form', () => {
      confirm();

      expect(host.confirmedWith).toEqual([]);
      expect(errorsOf('recovery-amount')).toBe('Amount is required.');
      expect(errorsOf('recovery-method')).toBe('Method is required.');
      expect(document.activeElement?.id).toBe('recovery-amount');
    });
  });

  describe('amount', () => {
    beforeEach(() => create());

    it('must be above zero', () => {
      setValue(fixture, '#recovery-amount', '0');
      expect(errorsOf('recovery-amount')).toBe('Must be greater than 0.');

      setValue(fixture, '#recovery-amount', '-10');
      expect(errorsOf('recovery-amount')).toBe('Must be greater than 0.');

      setValue(fixture, '#recovery-amount', '0.01');
      expect(query(fixture, '#recovery-amount-errors')).toBeNull();
    });

    it('may be the whole outstanding balance but not a cent more', () => {
      setValue(fixture, '#recovery-amount', '750');
      expect(query(fixture, '#recovery-amount-errors')).toBeNull();

      setValue(fixture, '#recovery-amount', '750.01');
      expect(errorsOf('recovery-amount')).toBe('Amount cannot be more than the outstanding balance of $750.00.');
    });

    it('allows cents but nothing finer', () => {
      setValue(fixture, '#recovery-amount', '10.123');

      expect(errorsOf('recovery-amount')).toBe('Use at most 2 decimal places.');
    });

    it('is filled with the outstanding balance by "Use balance"', () => {
      click(fixture, '[data-action="use-outstanding"]');

      expect(value('#recovery-amount')).toBe('750');
      expect(dialog().form.controls.amount.valid).toBeTrue();
    });

    it('follows the balance of the takeback it was opened for', () => {
      fixture.destroy();
      create(component => (component.takeback = buildTakeback({ takebackAmount: 300, recoveredAmount: 0, outstandingAmount: 300 })));

      setValue(fixture, '#recovery-amount', '300.01');

      expect(errorsOf('recovery-amount')).toBe('Amount cannot be more than the outstanding balance of $300.00.');
    });
  });

  describe('recovery date', () => {
    beforeEach(() => create());

    it('cannot lie in the future', () => {
      expect(query(fixture, '#recovery-date')?.getAttribute('max')).toBe(todayIso());

      setValue(fixture, '#recovery-date', addDaysIso(todayIso(), 1));

      expect(errorsOf('recovery-date')).toBe('The date cannot be in the future.');
    });

    it('cannot be before the day the notice was sent', () => {
      expect(query(fixture, '#recovery-date')?.getAttribute('min')).toBe('2025-03-01');

      setValue(fixture, '#recovery-date', '2025-02-28');
      expect(errorsOf('recovery-date')).toBe('Recovery date cannot be before the notice date (3/1/2025).');

      setValue(fixture, '#recovery-date', '2025-03-01');
      expect(query(fixture, '#recovery-date-errors')).toBeNull();
    });

    it('is required', () => {
      setValue(fixture, '#recovery-date', '');

      expect(errorsOf('recovery-date')).toBe('Recovery date is required.');
    });

    it('has no lower limit when the takeback has no notice date', () => {
      fixture.destroy();
      create(component => (component.takeback = buildTakeback({ noticeDate: null })));

      expect(query(fixture, '#recovery-date')?.hasAttribute('min')).toBeFalse();
    });
  });

  describe('reference number', () => {
    beforeEach(() => create());

    it('is required for a check', () => {
      fillValidRecovery();
      selectOption(fixture, '#recovery-method', 'Check');

      confirm();

      expect(host.confirmedWith).toEqual([]);
      expect(errorsOf('recovery-reference')).toBe('A reference number is required for check and EFT recoveries.');
      expect(document.activeElement?.id).toBe('recovery-reference');
    });

    it('is required for an EFT payment', () => {
      fillValidRecovery();
      selectOption(fixture, '#recovery-method', 'EFT');

      confirm();

      expect(host.confirmedWith).toEqual([]);
      expect(errorsOf('recovery-reference')).toBe('A reference number is required for check and EFT recoveries.');
    });

    it('is optional for an offset', () => {
      fillValidRecovery();

      confirm();

      expect(host.confirmedWith.length).toBe(1);
      expect(query(fixture, '#recovery-reference-errors')).toBeNull();
    });

    it('does not count when it only consists of blanks', () => {
      fillValidRecovery();
      selectOption(fixture, '#recovery-method', 'Check');
      setValue(fixture, '#recovery-reference', '   ');

      confirm();

      expect(host.confirmedWith).toEqual([]);
      expect(errorsOf('recovery-reference')).toBe('A reference number is required for check and EFT recoveries.');
    });

    it('is checked again when the method changes', () => {
      selectOption(fixture, '#recovery-method', 'Check');
      expect(dialog().form.controls.referenceNumber.hasError('referenceRequired')).toBeTrue();

      selectOption(fixture, '#recovery-method', 'Offset');
      expect(dialog().form.controls.referenceNumber.valid).toBeTrue();

      selectOption(fixture, '#recovery-method', 'EFT');
      expect(dialog().form.controls.referenceNumber.hasError('referenceRequired')).toBeTrue();
    });

    it('is marked as required in its label only for a check or an EFT payment', () => {
      expect(textOf(fixture, 'label[for="recovery-reference"]')).toBe('Reference number (optional)');

      selectOption(fixture, '#recovery-method', 'Check');
      expect(textOf(fixture, 'label[for="recovery-reference"]')).toBe('Reference number *');
      expect(query(fixture, '#recovery-reference')?.getAttribute('aria-required')).toBe('true');

      selectOption(fixture, '#recovery-method', 'Offset');
      expect(textOf(fixture, 'label[for="recovery-reference"]')).toBe('Reference number (optional)');
    });

    it('is limited to 50 characters', () => {
      setValue(fixture, '#recovery-reference', 'R'.repeat(51));

      expect(errorsOf('recovery-reference')).toBe('Reference number must be at most 50 characters.');
    });
  });

  describe('notes', () => {
    beforeEach(() => create());

    it('are limited to 500 characters and the characters left are counted', () => {
      setValue(fixture, '#recovery-notes', 'n'.repeat(120));
      expect(textOf(fixture, '#recovery-notes + .form-text')).toBe('380 characters remaining');

      setValue(fixture, '#recovery-notes', 'n'.repeat(501));
      expect(errorsOf('recovery-notes')).toBe('Notes must be at most 500 characters.');
    });
  });

  describe('confirming', () => {
    beforeEach(() => create());

    it('hands over the recovery as entered', () => {
      setValue(fixture, '#recovery-amount', '250.5');
      setValue(fixture, '#recovery-date', '2025-03-05');
      selectOption(fixture, '#recovery-method', 'Check');
      setValue(fixture, '#recovery-reference', '  CHK-1001 ');
      setValue(fixture, '#recovery-notes', '  Mailed by the provider.  ');

      confirm();

      expect(host.confirmedWith).toEqual([
        {
          amount: 250.5,
          recoveryDate: '2025-03-05',
          method: RecoveryMethod.Check,
          referenceNumber: 'CHK-1001',
          notes: 'Mailed by the provider.'
        }
      ]);
    });

    it('hands over empty optional fields as null', () => {
      fillValidRecovery();

      confirm();

      expect(host.confirmedWith).toEqual([
        { amount: 250.5, recoveryDate: todayIso(), method: RecoveryMethod.Offset, referenceNumber: null, notes: null }
      ]);
    });

    it('submits with the Enter key of the form as well', () => {
      fillValidRecovery();

      submit(fixture, '#record-recovery-form');

      expect(host.confirmedWith.length).toBe(1);
    });

    it('does nothing while a request is running and disables the buttons', () => {
      fillValidRecovery();
      host.busy = true;
      fixture.detectChanges();

      submit(fixture, '#record-recovery-form');

      expect(host.confirmedWith).toEqual([]);
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeTrue();
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-dismiss]')?.disabled).toBeTrue();
      expect(query<HTMLButtonElement>(fixture, '[data-action="use-outstanding"]')?.disabled).toBeTrue();
      expect(query(fixture, '[data-dialog-confirm] .spinner-border')).not.toBeNull();
    });
  });

  describe('closing', () => {
    beforeEach(() => create());

    it('is possible with the Cancel button', () => {
      click(fixture, '[data-dialog-dismiss]');

      expect(host.cancelledCount).toBe(1);
      expect(host.confirmedWith).toEqual([]);
    });

    it('is possible with the Escape key', () => {
      keydown(document.body, 'Escape');

      expect(host.cancelledCount).toBe(1);
    });

    it('is not possible while the request is running', () => {
      host.busy = true;
      fixture.detectChanges();

      keydown(document.body, 'Escape');

      expect(host.cancelledCount).toBe(0);
    });
  });

  describe('server answers', () => {
    beforeEach(() => {
      create();
      fillValidRecovery();
    });

    it('puts validation messages on their fields and the rest into the alert', () => {
      host.error = apiError('VALIDATION', 'Validation failed.', [
        { field: 'referenceNumber', message: 'This reference was already recorded.' },
        { field: null, message: 'The recovery could not be recorded.' }
      ]);
      fixture.detectChanges();

      expect(errorsOf('recovery-reference')).toBe('This reference was already recorded.');
      expect(textOf(fixture, '[data-form-alert]')).toContain('The recovery could not be recorded.');
      expect(textOf(fixture, '[data-form-alert]')).not.toContain('already recorded');
    });

    it('puts a validation message of the amount on the amount field', () => {
      host.error = apiError('VALIDATION', 'Validation failed.', [{ field: 'amount', message: 'Exceeds the outstanding balance.' }]);
      fixture.detectChanges();

      expect(errorsOf('recovery-amount')).toBe('Exceeds the outstanding balance.');
    });

    it('shows any other error in the alert', () => {
      host.error = apiError('BUSINESS_RULE', 'Recoveries can only be recorded after a notice was sent.');
      fixture.detectChanges();

      expect(textOf(fixture, '[data-form-alert]')).toContain('Recoveries can only be recorded after a notice was sent.');
    });

    it('clears the alert when the next attempt starts', () => {
      host.error = apiError('BUSINESS_RULE', 'Recoveries can only be recorded after a notice was sent.');
      fixture.detectChanges();

      confirm();

      expect(query(fixture, '[data-form-alert]')).toBeNull();
      expect(host.confirmedWith.length).toBe(1);
    });
  });
});
