import { fakeAsync, tick } from '@angular/core/testing';

import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  it('collects toasts of every kind with a title and message', () => {
    service.error('Saving failed', 'Oops');
    service.warning('Careful');

    expect(service.toasts.map(toast => toast.kind)).toEqual(['error', 'warning']);
    expect(service.toasts[0]).toEqual(jasmine.objectContaining({ message: 'Saving failed', title: 'Oops' }));
    expect(service.toasts[1].title).toBeNull();
  });

  it('emits the current list through toasts$', () => {
    const lengths: number[] = [];
    service.toasts$.subscribe(toasts => lengths.push(toasts.length));

    const id = service.info('Hello');
    service.dismiss(id);

    expect(lengths).toEqual([0, 1, 0]);
  });

  it('dismisses success toasts by itself after about four seconds', fakeAsync(() => {
    service.success('Saved');
    expect(service.toasts.length).toBe(1);

    tick(NotificationService.autoDismissMs - 1);
    expect(service.toasts.length).toBe(1);

    tick(1);
    expect(service.toasts.length).toBe(0);
  }));

  it('dismisses info toasts automatically as well', fakeAsync(() => {
    service.info('FYI');

    tick(NotificationService.autoDismissMs);

    expect(service.toasts).toEqual([]);
  }));

  it('keeps errors and warnings until they are closed', fakeAsync(() => {
    const errorId = service.error('Failed');
    service.warning('Heads up');

    tick(60_000);
    expect(service.toasts.length).toBe(2);

    service.dismiss(errorId);
    expect(service.toasts.map(toast => toast.message)).toEqual(['Heads up']);
  }));

  it('does not stack identical messages', () => {
    const first = service.error('Same');
    const second = service.error('Same');

    expect(second).toBe(first);
    expect(service.toasts.length).toBe(1);
  });

  it('clear removes everything', () => {
    service.error('a');
    service.warning('b');

    service.clear();

    expect(service.toasts).toEqual([]);
  });
});
