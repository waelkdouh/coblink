import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  title: string | null;
}

/** Collects the messages shown by the toast container in the shell. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  /** Success and info toasts disappear on their own; warnings and errors stay until they are closed. */
  static readonly autoDismissMs = 4000;

  private nextId = 1;
  private readonly toastsSubject = new BehaviorSubject<Toast[]>([]);

  readonly toasts$: Observable<Toast[]> = this.toastsSubject.asObservable();

  get toasts(): Toast[] {
    return this.toastsSubject.value;
  }

  success(message: string, title: string | null = null): number {
    return this.show('success', message, title);
  }

  info(message: string, title: string | null = null): number {
    return this.show('info', message, title);
  }

  warning(message: string, title: string | null = null): number {
    return this.show('warning', message, title);
  }

  error(message: string, title: string | null = null): number {
    return this.show('error', message, title);
  }

  dismiss(id: number): void {
    this.toastsSubject.next(this.toasts.filter(toast => toast.id !== id));
  }

  clear(): void {
    this.toastsSubject.next([]);
  }

  private show(kind: ToastKind, message: string, title: string | null): number {
    const existing = this.toasts.find(toast => toast.kind === kind && toast.message === message);
    if (existing) {
      return existing.id;
    }

    const toast: Toast = { id: this.nextId++, kind, message, title };
    this.toastsSubject.next([...this.toasts, toast]);

    if (kind === 'success' || kind === 'info') {
      setTimeout(() => this.dismiss(toast.id), NotificationService.autoDismissMs);
    }
    return toast.id;
  }
}
