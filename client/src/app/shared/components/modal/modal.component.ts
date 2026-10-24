import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let nextModalId = 0;

/**
 * Dialog with its own markup and backdrop (no Bootstrap JavaScript). It exists while its parent renders it, so the
 * parent opens it with *ngIf and removes it when `closed` fires. The first control gets the focus when it appears,
 * Tab stays inside it and the previously focused element gets the focus back when it goes away.
 */
@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss']
})
export class ModalComponent implements AfterViewInit, OnDestroy {
  @Input() title = '';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  /** False while a request is running: ESC, the backdrop and the close button are ignored. */
  @Input() dismissible = true;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLElement>;

  readonly titleId = `app-modal-title-${++nextModalId}`;

  private previouslyFocused: HTMLElement | null = null;
  private previousOverflow = '';

  ngAfterViewInit(): void {
    this.previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.focusFirstControl();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
    const target = this.previouslyFocused;
    if (target && document.body.contains(target)) {
      target.focus();
    }
  }

  close(): void {
    if (this.dismissible) {
      this.closed.emit();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = this.focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.dialog.nativeElement.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.dialog.nativeElement.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(this.dialog.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
  }

  private focusFirstControl(): void {
    const root = this.dialog.nativeElement;
    const target =
      root.querySelector<HTMLElement>(`.modal-body :is(${FOCUSABLE})`) ??
      root.querySelector<HTMLElement>(`.modal-footer :is(${FOCUSABLE})`) ??
      root.querySelector<HTMLElement>(FOCUSABLE);
    (target ?? root).focus();
  }
}
