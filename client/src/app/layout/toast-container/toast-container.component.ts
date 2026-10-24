import { Component } from '@angular/core';

import { NotificationService, Toast, ToastKind } from '../../core/services/notification.service';

const COLOUR_BY_KIND: Record<ToastKind, string> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'danger'
};

@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.component.html'
})
export class ToastContainerComponent {
  readonly toasts$ = this.notifications.toasts$;

  constructor(private readonly notifications: NotificationService) {}

  trackById(_index: number, toast: Toast): number {
    return toast.id;
  }

  colourClass(toast: Toast): string {
    return `text-bg-${COLOUR_BY_KIND[toast.kind]}`;
  }

  closeButtonIsLight(toast: Toast): boolean {
    return toast.kind === 'success' || toast.kind === 'error';
  }

  dismiss(toast: Toast): void {
    this.notifications.dismiss(toast.id);
  }
}
