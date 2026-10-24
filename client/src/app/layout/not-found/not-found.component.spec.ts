import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { SharedModule } from '../../shared/shared.module';
import { query, textOf } from '../../testing/test-helpers';
import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  let fixture: ComponentFixture<NotFoundComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [NotFoundComponent],
      imports: [SharedModule, RouterTestingModule]
    });
    fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
  });

  it('tells the user that the page does not exist', () => {
    expect(textOf(fixture, '[data-empty-state]')).toContain('Page not found');
  });

  it('offers a way back to the dashboard', () => {
    const link = query<HTMLAnchorElement>(fixture, 'a.btn');

    expect(link?.textContent?.trim()).toBe('Go to the dashboard');
    expect(link?.getAttribute('href')).toBe('/dashboard');
  });
});
