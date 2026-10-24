import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { BlankComponent } from '../../testing/blank.component';
import { navigateInZone } from '../../testing/test-helpers';
import { AppTitleStrategy } from './app-title.strategy';

describe('AppTitleStrategy', () => {
  let title: Title;
  let originalTitle: string;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [BlankComponent],
      imports: [
        RouterTestingModule.withRoutes([
          { path: 'dashboard', component: BlankComponent, title: 'Dashboard' },
          { path: 'untitled', component: BlankComponent }
        ])
      ],
      providers: [{ provide: TitleStrategy, useExisting: AppTitleStrategy }]
    });
    title = TestBed.inject(Title);
    originalTitle = title.getTitle();
  });

  afterEach(() => title.setTitle(originalTitle));

  it('adds the application name to the title of the route', async () => {
    await navigateInZone('/dashboard');

    expect(title.getTitle()).toBe('Dashboard - COBLink');
  });

  it('uses the application name alone for a route without a title', async () => {
    await navigateInZone('/untitled');

    expect(title.getTitle()).toBe('COBLink');
  });
});
