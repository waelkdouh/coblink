import { TestBed } from '@angular/core/testing';

import { query } from '../../../testing/test-helpers';
import { LoadingSpinnerComponent } from './loading-spinner.component';

describe('LoadingSpinnerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [LoadingSpinnerComponent] });
  });

  it('announces the loading state with a status role', () => {
    const fixture = TestBed.createComponent(LoadingSpinnerComponent);
    fixture.componentInstance.label = 'Loading activities...';
    fixture.detectChanges();

    expect(query(fixture, '[role="status"]')?.textContent).toContain('Loading activities...');
    expect(query(fixture, '.spinner-border')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('has a default label', () => {
    const fixture = TestBed.createComponent(LoadingSpinnerComponent);
    fixture.detectChanges();

    expect(query(fixture, '[role="status"]')?.textContent).toContain('Loading...');
  });
});
