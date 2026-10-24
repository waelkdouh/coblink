import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { NotificationService } from '../../core/services/notification.service';
import { click, query, queryAll, textOf } from '../../testing/test-helpers';
import { ToastContainerComponent } from './toast-container.component';

describe('ToastContainerComponent', () => {
  let fixture: ComponentFixture<ToastContainerComponent>;
  let notifications: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [ToastContainerComponent] });
    notifications = TestBed.inject(NotificationService);
    fixture = TestBed.createComponent(ToastContainerComponent);
    fixture.detectChanges();
  });

  function toasts(): HTMLElement[] {
    return queryAll(fixture, '[data-toast]');
  }

  it('is a polite live region that starts empty', () => {
    expect(query(fixture, '.toast-container-coblink')?.getAttribute('aria-live')).toBe('polite');
    expect(toasts()).toEqual([]);
  });

  it('shows the messages of the notification service', () => {
    notifications.error('The record could not be saved.');
    fixture.detectChanges();

    expect(toasts().length).toBe(1);
    expect(textOf(fixture, '[data-toast]')).toContain('The record could not be saved.');
  });

  it('shows the optional title above the message', () => {
    notifications.warning('Check the dates.', 'Heads up');
    fixture.detectChanges();

    expect(textOf(fixture, '[data-toast] strong')).toBe('Heads up');
    expect(textOf(fixture, '[data-toast]')).toContain('Check the dates.');
  });

  it('uses a Bootstrap colour and an ARIA role that fit the kind of message', () => {
    notifications.success('Saved.');
    notifications.info('FYI.');
    notifications.warning('Careful.');
    notifications.error('Broken.');
    fixture.detectChanges();

    const byKind = (kind: string): HTMLElement => query(fixture, `[data-toast-kind="${kind}"]`) as HTMLElement;
    expect(byKind('success').classList).toContain('text-bg-success');
    expect(byKind('info').classList).toContain('text-bg-info');
    expect(byKind('warning').classList).toContain('text-bg-warning');
    expect(byKind('error').classList).toContain('text-bg-danger');
    expect(byKind('error').getAttribute('role')).toBe('alert');
    expect(byKind('success').getAttribute('role')).toBe('status');
  });

  it('removes a toast when its close button is clicked', () => {
    notifications.error('First problem.');
    notifications.error('Second problem.');
    fixture.detectChanges();

    click(fixture, '[data-toast] .btn-close');

    expect(toasts().length).toBe(1);
    expect(textOf(fixture, '[data-toast]')).toContain('Second problem.');
  });

  it('labels the close button', () => {
    notifications.error('Problem.');
    fixture.detectChanges();

    expect(query(fixture, '[data-toast] .btn-close')?.getAttribute('aria-label')).toBe('Close');
  });

  it('dismisses success toasts after a few seconds but keeps errors until they are closed', fakeAsync(() => {
    notifications.success('Saved.');
    notifications.error('Could not reach the service.');
    fixture.detectChanges();
    expect(toasts().length).toBe(2);

    tick(NotificationService.autoDismissMs);
    fixture.detectChanges();

    expect(toasts().length).toBe(1);
    expect(textOf(fixture, '[data-toast]')).toContain('Could not reach the service.');
  }));
});
