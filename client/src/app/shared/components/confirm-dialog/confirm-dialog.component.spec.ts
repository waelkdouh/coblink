import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LookupService } from '../../../core/services/lookup.service';
import { ApiError } from '../../../models/api';
import { createLookupServiceSpy } from '../../../testing/test-doubles';
import { query, textOf } from '../../../testing/test-helpers';
import { SharedModule } from '../../shared.module';

@Component({
  template: `
    <app-confirm-dialog
      title="Submit takeback"
      message="Send it for approval?"
      confirmLabel="Submit"
      [busy]="busy"
      [error]="error"
      (confirmed)="confirmCount = confirmCount + 1"
      (cancelled)="cancelledCount = cancelledCount + 1"
    >
      <p data-extra>Extra explanation.</p>
    </app-confirm-dialog>
  `
})
class ConfirmDialogHostComponent {
  busy = false;
  error: ApiError | null = null;
  confirmCount = 0;
  cancelledCount = 0;
}

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogHostComponent>;
  let host: ConfirmDialogHostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [ConfirmDialogHostComponent],
      providers: [{ provide: LookupService, useValue: createLookupServiceSpy() }]
    });
    fixture = TestBed.createComponent(ConfirmDialogHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  function element(selector: string): HTMLButtonElement {
    return query<HTMLButtonElement>(fixture, selector) as HTMLButtonElement;
  }

  it('shows the message, the projected explanation and the labels', () => {
    expect(textOf(fixture, '.modal-title')).toBe('Submit takeback');
    expect(textOf(fixture, '.modal-body')).toContain('Send it for approval?');
    expect(element('[data-extra]').textContent).toBe('Extra explanation.');
    expect(element('[data-dialog-confirm]').textContent?.trim()).toBe('Submit');
    expect(element('[data-dialog-dismiss]').textContent?.trim()).toBe('Cancel');
  });

  it('emits confirmed and cancelled', () => {
    element('[data-dialog-confirm]').click();
    element('[data-dialog-dismiss]').click();

    expect(host.confirmCount).toBe(1);
    expect(host.cancelledCount).toBe(1);
  });

  it('keeps the dialog open and shows the error of a failed attempt', () => {
    host.error = new ApiError(200, 'BUSINESS_RULE', 'Only a draft can be submitted.');
    fixture.detectChanges();

    expect(element('[data-dialog-error]').textContent).toBe('Only a draft can be submitted.');
    expect(element('[data-dialog-error]').getAttribute('role')).toBe('alert');
  });

  it('blocks a double submit while busy', () => {
    host.busy = true;
    fixture.detectChanges();

    expect(element('[data-dialog-confirm]').disabled).toBeTrue();
    expect(element('[data-dialog-dismiss]').disabled).toBeTrue();
    expect(element('[data-dialog-confirm] .spinner-border')).not.toBeNull();
  });

  it('ignores ESC while busy', () => {
    host.busy = true;
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(host.cancelledCount).toBe(0);
  });
});
