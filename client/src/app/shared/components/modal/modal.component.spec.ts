import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SharedModule } from '../../shared.module';
import { LookupService } from '../../../core/services/lookup.service';
import { createLookupServiceSpy } from '../../../testing/test-doubles';
import { keydown, query } from '../../../testing/test-helpers';

@Component({
  template: `
    <button type="button" id="opener" (click)="open = true">Open</button>
    <app-modal *ngIf="open" title="Edit things" [size]="size" [dismissible]="dismissible" (closed)="onClosed()">
      <label for="first-field">First</label>
      <input id="first-field" type="text" />
      <input id="second-field" type="text" />
      <ng-container appModalFooter>
        <button type="button" id="cancel-button">Cancel</button>
        <button type="button" id="ok-button">OK</button>
      </ng-container>
    </app-modal>
  `
})
class ModalHostComponent {
  open = true;
  size: 'sm' | 'md' | 'lg' = 'md';
  dismissible = true;
  closedCount = 0;

  onClosed(): void {
    this.closedCount++;
    this.open = false;
  }
}

describe('ModalComponent', () => {
  let fixture: ComponentFixture<ModalHostComponent>;
  let host: ModalHostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [ModalHostComponent],
      providers: [{ provide: LookupService, useValue: createLookupServiceSpy() }]
    });
    fixture = TestBed.createComponent(ModalHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    document.body.style.overflow = '';
  });

  function dialog(): HTMLElement | null {
    return query(fixture, '[role="dialog"]');
  }

  it('renders an accessible dialog with the title and the projected content', () => {
    const element = dialog();

    expect(element).not.toBeNull();
    expect(element?.getAttribute('aria-modal')).toBe('true');
    const titleId = element?.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(titleId)?.textContent).toContain('Edit things');
    expect(query(fixture, '#first-field')).not.toBeNull();
    expect(query(fixture, '.modal-footer #ok-button')).not.toBeNull();
    expect(query(fixture, '.modal-backdrop')).not.toBeNull();
  });

  it('moves the focus to the first control of the body', () => {
    expect(document.activeElement?.id).toBe('first-field');
  });

  it('locks the page scroll while open and restores it afterwards', () => {
    expect(document.body.style.overflow).toBe('hidden');

    host.open = false;
    fixture.detectChanges();

    expect(document.body.style.overflow).toBe('');
  });

  it('closes on ESC', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(host.closedCount).toBe(1);
    expect(dialog()).toBeNull();
  });

  it('closes when the backdrop is clicked, but not when the dialog content is clicked', () => {
    query(fixture, '#first-field')?.click();
    fixture.detectChanges();
    expect(host.closedCount).toBe(0);

    dialog()?.click();
    fixture.detectChanges();

    expect(host.closedCount).toBe(1);
  });

  it('closes with the close button', () => {
    query(fixture, '.btn-close')?.click();
    fixture.detectChanges();

    expect(host.closedCount).toBe(1);
    expect(dialog()).toBeNull();
  });

  it('ignores ESC, the backdrop and the close button while it is not dismissible', () => {
    host.dismissible = false;
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialog()?.click();
    (query(fixture, '.btn-close') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.closedCount).toBe(0);
    expect((query(fixture, '.btn-close') as HTMLButtonElement).disabled).toBeTrue();
    expect(dialog()).not.toBeNull();
  });

  it('keeps Tab inside the dialog (wraps from the last control to the first)', () => {
    const last = query<HTMLButtonElement>(fixture, '#ok-button') as HTMLButtonElement;
    last.focus();

    const event = keydown(last, 'Tab');

    expect(event.defaultPrevented).toBeTrue();
    expect(document.activeElement?.classList.contains('btn-close')).toBeTrue();
  });

  it('keeps Shift+Tab inside the dialog (wraps from the first control to the last)', () => {
    const first = query<HTMLButtonElement>(fixture, '.btn-close') as HTMLButtonElement;
    first.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(event);

    expect(event.defaultPrevented).toBeTrue();
    expect(document.activeElement?.id).toBe('ok-button');
  });

  it('gives the focus back to the element that opened it', () => {
    host.open = false;
    fixture.detectChanges();
    const opener = query<HTMLButtonElement>(fixture, '#opener') as HTMLButtonElement;
    opener.focus();

    host.open = true;
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('first-field');

    host.open = false;
    fixture.detectChanges();

    expect(document.activeElement).toBe(opener);
  });

  it('supports the small and large sizes', () => {
    host.size = 'lg';
    fixture.detectChanges();
    expect(query(fixture, '.modal-dialog.modal-lg')).not.toBeNull();

    host.size = 'sm';
    fixture.detectChanges();
    expect(query(fixture, '.modal-dialog.modal-sm')).not.toBeNull();
    expect(query(fixture, '.modal-dialog.modal-lg')).toBeNull();
  });
});
