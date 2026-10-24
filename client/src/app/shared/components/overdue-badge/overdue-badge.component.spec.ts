import { TestBed } from '@angular/core/testing';

import { LookupService } from '../../../core/services/lookup.service';
import { createLookupServiceSpy } from '../../../testing/test-doubles';
import { SharedModule } from '../../shared.module';
import { OverdueBadgeComponent } from './overdue-badge.component';

describe('OverdueBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SharedModule],
      providers: [{ provide: LookupService, useValue: createLookupServiceSpy() }]
    });
  });

  function badgeFor(overdue: boolean | null | undefined): HTMLElement | null {
    const fixture = TestBed.createComponent(OverdueBadgeComponent);
    fixture.componentInstance.overdue = overdue;
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.badge');
  }

  it('shows the red Overdue badge for an overdue record', () => {
    const badge = badgeFor(true);

    expect(badge?.textContent?.trim()).toBe('Overdue');
    expect(badge?.classList).toContain('text-bg-danger');
  });

  it('shows nothing when the record is not overdue', () => {
    expect(badgeFor(false)).toBeNull();
    expect(badgeFor(null)).toBeNull();
    expect(badgeFor(undefined)).toBeNull();
  });
});
