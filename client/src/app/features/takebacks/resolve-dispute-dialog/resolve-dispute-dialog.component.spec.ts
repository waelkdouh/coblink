import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LookupService } from '../../../core/services/lookup.service';
import { ApiError } from '../../../models/api';
import { SharedModule } from '../../../shared/shared.module';
import { apiError, createLookupServiceSpy } from '../../../testing/test-doubles';
import { click, keydown, query, queryAll, setChecked, setValue, submit, textOf } from '../../../testing/test-helpers';
import { ResolveDisputeDialogComponent, ResolveDisputeFormValue } from './resolve-dispute-dialog.component';

@Component({
  template: `
    <app-resolve-dispute-dialog
      [busy]="busy"
      [error]="error"
      (confirmed)="confirmedWith.push($event)"
      (cancelled)="cancelledCount = cancelledCount + 1"
    ></app-resolve-dispute-dialog>
  `
})
class ResolveDisputeHostComponent {
  busy = false;
  error: ApiError | null = null;
  confirmedWith: ResolveDisputeFormValue[] = [];
  cancelledCount = 0;
}

describe('ResolveDisputeDialogComponent', () => {
  let fixture: ComponentFixture<ResolveDisputeHostComponent>;
  let host: ResolveDisputeHostComponent;

  function create(): void {
    fixture = TestBed.createComponent(ResolveDisputeHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  }

  function dialog(): ResolveDisputeDialogComponent {
    return fixture.debugElement.children[0].componentInstance as ResolveDisputeDialogComponent;
  }

  function confirm(): void {
    click(fixture, '[data-dialog-confirm]');
  }

  function errorsOf(controlId: string): string {
    return textOf(fixture, `#${controlId}-errors`);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [ResolveDisputeDialogComponent, ResolveDisputeHostComponent],
      providers: [{ provide: LookupService, useValue: createLookupServiceSpy() }]
    });
    create();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('is a dialog titled "Resolve dispute"', () => {
    expect(query(fixture, '[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(textOf(fixture, '.modal-title')).toBe('Resolve dispute');
  });

  it('offers the two decisions as radio buttons and preselects neither', () => {
    expect(textOf(fixture, 'label[for="resolve-upheld"]')).toBe('Dispute upheld – takeback stands');
    expect(textOf(fixture, 'label[for="resolve-overturned"]')).toBe('Dispute overturned – cancel takeback');
    expect(queryAll<HTMLInputElement>(fixture, 'input[type="radio"]').map(radio => radio.checked)).toEqual([false, false]);
    expect(query(fixture, 'fieldset legend')?.textContent).toContain('Decision');
  });

  it('needs a decision and a comment before anything is resolved', () => {
    confirm();

    expect(host.confirmedWith).toEqual([]);
    expect(errorsOf('resolve-upheld')).toBe('Decision is required.');
    expect(errorsOf('resolve-comment')).toBe('Comment is required.');
    expect(document.activeElement?.id).toBe('resolve-upheld');
  });

  it('needs a comment when the decision was made', () => {
    setChecked(fixture, '#resolve-upheld', true);

    confirm();

    expect(host.confirmedWith).toEqual([]);
    expect(query(fixture, '#resolve-upheld-errors')).toBeNull();
    expect(errorsOf('resolve-comment')).toBe('Comment is required.');
    expect(document.activeElement?.id).toBe('resolve-comment');
  });

  it('does not accept a comment that only consists of blanks', () => {
    setChecked(fixture, '#resolve-upheld', true);
    setValue(fixture, '#resolve-comment', '    ');

    expect(errorsOf('resolve-comment')).toBe('Comment is required.');
  });

  it('limits the comment to 1000 characters and counts the characters left', () => {
    setValue(fixture, '#resolve-comment', 'c'.repeat(100));
    expect(textOf(fixture, '#resolve-comment ~ .form-text')).toBe('900 characters remaining');
    expect(query(fixture, '#resolve-comment-errors')).toBeNull();

    setValue(fixture, '#resolve-comment', 'c'.repeat(1001));
    expect(errorsOf('resolve-comment')).toBe('Comment must be at most 1000 characters.');
  });

  it('names the consequence on the confirm button, in red when the takeback would be cancelled', () => {
    const button = (): HTMLElement => query(fixture, '[data-dialog-confirm]') as HTMLElement;
    expect(button().textContent?.trim()).toBe('Resolve dispute');

    setChecked(fixture, '#resolve-upheld', true);
    expect(button().textContent?.trim()).toBe('Uphold the takeback');
    expect(button().classList).toContain('btn-primary');

    setChecked(fixture, '#resolve-overturned', true);
    expect(button().textContent?.trim()).toBe('Cancel the takeback');
    expect(button().classList).toContain('btn-danger');
    expect(button().classList).not.toContain('btn-primary');
  });

  it('hands over "upheld" with the trimmed comment', () => {
    setChecked(fixture, '#resolve-upheld', true);
    setValue(fixture, '#resolve-comment', '  The provider billed correctly.  ');

    confirm();

    expect(host.confirmedWith).toEqual([{ upheld: true, comment: 'The provider billed correctly.' }]);
  });

  it('hands over "overturned" as upheld = false', () => {
    setChecked(fixture, '#resolve-overturned', true);
    setValue(fixture, '#resolve-comment', 'Documents prove the other carrier paid.');

    confirm();

    expect(host.confirmedWith).toEqual([{ upheld: false, comment: 'Documents prove the other carrier paid.' }]);
  });

  it('keeps the other radio button unchecked when the decision changes', () => {
    setChecked(fixture, '#resolve-upheld', true);
    setChecked(fixture, '#resolve-overturned', true);

    expect(dialog().form.controls.upheld.value).toBeFalse();
    expect(query<HTMLInputElement>(fixture, '#resolve-upheld')?.checked).toBeFalse();
  });

  it('does nothing while a request is running and disables the buttons', () => {
    setChecked(fixture, '#resolve-upheld', true);
    setValue(fixture, '#resolve-comment', 'Upheld.');
    host.busy = true;
    fixture.detectChanges();

    submit(fixture, '#resolve-dispute-form');

    expect(host.confirmedWith).toEqual([]);
    expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeTrue();
    expect(query<HTMLButtonElement>(fixture, '[data-dialog-dismiss]')?.disabled).toBeTrue();
    expect(query(fixture, '[data-dialog-confirm] .spinner-border')).not.toBeNull();
  });

  it('closes with the Cancel button and with Escape, but not while a request is running', () => {
    click(fixture, '[data-dialog-dismiss]');
    expect(host.cancelledCount).toBe(1);

    keydown(document.body, 'Escape');
    expect(host.cancelledCount).toBe(2);

    host.busy = true;
    fixture.detectChanges();
    keydown(document.body, 'Escape');
    expect(host.cancelledCount).toBe(2);
  });

  it('puts a validation message on the comment and shows any other error in the alert', () => {
    setChecked(fixture, '#resolve-upheld', true);
    setValue(fixture, '#resolve-comment', 'Upheld.');

    host.error = apiError('VALIDATION', 'Validation failed.', [
      { field: 'comment', message: 'The comment is too vague.' },
      { field: null, message: 'The dispute could not be resolved.' }
    ]);
    fixture.detectChanges();

    expect(errorsOf('resolve-comment')).toBe('The comment is too vague.');
    expect(textOf(fixture, '[data-form-alert]')).toContain('The dispute could not be resolved.');
  });

  it('explains a business rule that stopped the decision', () => {
    host.error = apiError('BUSINESS_RULE', 'A recovery was recorded, so the takeback cannot be cancelled. Write it off instead.');
    fixture.detectChanges();

    expect(textOf(fixture, '[data-form-alert]')).toContain('A recovery was recorded');
  });
});
