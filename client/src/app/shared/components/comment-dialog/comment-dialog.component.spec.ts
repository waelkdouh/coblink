import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LookupService } from '../../../core/services/lookup.service';
import { ApiError } from '../../../models/api';
import { createLookupServiceSpy } from '../../../testing/test-doubles';
import { click, query, setValue, submit, textOf } from '../../../testing/test-helpers';
import { SharedModule } from '../../shared.module';

@Component({
  template: `
    <app-comment-dialog
      title="Complete activity"
      message="Describe the outcome."
      label="Outcome"
      confirmLabel="Complete"
      dismissLabel="Back"
      [required]="required"
      [maxLength]="maxLength"
      [busy]="busy"
      [error]="error"
      (confirmed)="confirmedWith.push($event)"
      (cancelled)="cancelledCount = cancelledCount + 1"
    ></app-comment-dialog>
  `
})
class CommentDialogHostComponent {
  required = true;
  maxLength: number | null = 20;
  busy = false;
  error: ApiError | null = null;
  confirmedWith: (string | null)[] = [];
  cancelledCount = 0;
}

describe('CommentDialogComponent', () => {
  let fixture: ComponentFixture<CommentDialogHostComponent>;
  let host: CommentDialogHostComponent;

  function create(configure: (component: CommentDialogHostComponent) => void = () => undefined): void {
    fixture = TestBed.createComponent(CommentDialogHostComponent);
    host = fixture.componentInstance;
    configure(host);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [CommentDialogHostComponent],
      providers: [{ provide: LookupService, useValue: createLookupServiceSpy() }]
    });
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('shows the title, the message, the label and the button texts', () => {
    create();

    expect(textOf(fixture, '.modal-title')).toBe('Complete activity');
    expect(textOf(fixture, 'form p')).toBe('Describe the outcome.');
    expect(textOf(fixture, 'form label')).toContain('Outcome');
    expect(textOf(fixture, '[data-dialog-confirm]')).toBe('Complete');
    expect(textOf(fixture, '[data-dialog-dismiss]')).toBe('Back');
  });

  it('marks a required comment with an asterisk', () => {
    create();

    expect(textOf(fixture, 'form label')).not.toContain('(optional)');
    expect(query(fixture, 'textarea')?.getAttribute('aria-required')).toBe('true');
  });

  it('calls an optional comment optional', () => {
    create(component => (component.required = false));

    expect(textOf(fixture, 'form label')).toContain('(optional)');
    expect(query(fixture, 'textarea')?.getAttribute('aria-required')).toBe('false');
  });

  it('does not confirm an empty required comment and explains why', () => {
    create();

    click(fixture, '[data-dialog-confirm]');

    expect(host.confirmedWith).toEqual([]);
    expect(textOf(fixture, '[data-field-errors]')).toBe('Outcome is required.');
  });

  it('treats a comment of blanks as empty', () => {
    create();

    setValue(fixture, 'textarea', '    ');
    click(fixture, '[data-dialog-confirm]');

    expect(host.confirmedWith).toEqual([]);
  });

  it('moves the focus to the comment box when it is invalid', () => {
    create();

    click(fixture, '[data-dialog-confirm]');

    expect(document.activeElement).toBe(query(fixture, 'textarea'));
  });

  it('confirms with the trimmed comment', () => {
    create();

    setValue(fixture, 'textarea', '  Reached them.  ');
    click(fixture, '[data-dialog-confirm]');

    expect(host.confirmedWith).toEqual(['Reached them.']);
  });

  it('confirms an empty optional comment as null', () => {
    create(component => (component.required = false));

    click(fixture, '[data-dialog-confirm]');

    expect(host.confirmedWith).toEqual([null]);
  });

  it('rejects a comment that is too long and counts the characters left', () => {
    create();
    expect(textOf(fixture, '.form-text')).toBe('20 characters remaining');

    setValue(fixture, 'textarea', 'x'.repeat(25));
    expect(textOf(fixture, '.form-text')).toBe('-5 characters remaining');
    click(fixture, '[data-dialog-confirm]');

    expect(host.confirmedWith).toEqual([]);
    expect(textOf(fixture, '[data-field-errors]')).toBe('Outcome must be at most 20 characters.');
  });

  it('has no limit text when no maximum is set', () => {
    create(component => (component.maxLength = null));

    expect(query(fixture, '.form-text')).toBeNull();
  });

  it('confirms through the submit event of its form (Enter in a field)', () => {
    create();
    setValue(fixture, 'textarea', 'Done.');

    submit(fixture, 'form');

    expect(host.confirmedWith).toEqual(['Done.']);
  });

  it('emits cancelled from the dismiss button, the close button and ESC', () => {
    create();

    click(fixture, '[data-dialog-dismiss]');
    click(fixture, '.btn-close');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(host.cancelledCount).toBe(3);
  });

  it('disables everything while the request runs', () => {
    create(component => (component.busy = true));

    expect((query(fixture, '[data-dialog-confirm]') as HTMLButtonElement).disabled).toBeTrue();
    expect((query(fixture, '[data-dialog-dismiss]') as HTMLButtonElement).disabled).toBeTrue();
    expect(query(fixture, '[data-dialog-confirm] .spinner-border')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.cancelledCount).toBe(0);
  });

  it('does not emit a second time while busy', () => {
    create();
    setValue(fixture, 'textarea', 'Done.');
    host.busy = true;
    fixture.detectChanges();

    submit(fixture, 'form');

    expect(host.confirmedWith).toEqual([]);
  });

  it('shows a server validation error on the comment box', () => {
    create();

    host.error = new ApiError(200, 'VALIDATION', 'Invalid.', [{ field: 'comment', message: 'Outcome is required by the server.' }]);
    fixture.detectChanges();

    expect(textOf(fixture, '[data-field-errors]')).toBe('Outcome is required by the server.');
    expect(query(fixture, '[data-form-alert]')).toBeNull();
  });

  it('shows other failures in an alert', () => {
    create();

    host.error = new ApiError(200, 'BUSINESS_RULE', 'The activity is already completed.');
    fixture.detectChanges();

    expect(textOf(fixture, '[data-form-alert]')).toContain('The activity is already completed.');
  });
});
