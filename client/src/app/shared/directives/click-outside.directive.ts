import { Directive, ElementRef, EventEmitter, HostListener, Output } from '@angular/core';

/** Emits when the user clicks anywhere outside of the host element (closes the navbar menus). */
@Directive({ selector: '[appClickOutside]' })
export class ClickOutsideDirective {
  @Output() appClickOutside = new EventEmitter<void>();

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.appClickOutside.emit();
    }
  }
}
