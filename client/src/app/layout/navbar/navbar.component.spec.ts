import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { throwError } from 'rxjs';

import { LookupService } from '../../core/services/lookup.service';
import { SessionService } from '../../core/services/session.service';
import { UserRole } from '../../models/enums';
import { SharedModule } from '../../shared/shared.module';
import { BlankComponent } from '../../testing/blank.component';
import { buildSession, buildUser } from '../../testing/test-data';
import {
  SessionStub,
  SessionStubOptions,
  apiError,
  createLookupServiceSpy,
  createSessionServiceStub
} from '../../testing/test-doubles';
import { click, keydown, navigateInZone, query, queryAll, textOf } from '../../testing/test-helpers';
import { NavbarComponent } from './navbar.component';

describe('NavbarComponent', () => {
  let fixture: ComponentFixture<NavbarComponent>;
  let stub: SessionStub;

  function create(options: SessionStubOptions = {}): void {
    stub = createSessionServiceStub(options);
    TestBed.configureTestingModule({
      declarations: [NavbarComponent, BlankComponent],
      imports: [
        SharedModule,
        RouterTestingModule.withRoutes([
          { path: 'dashboard', component: BlankComponent },
          { path: 'activities', component: BlankComponent },
          { path: 'takebacks', component: BlankComponent }
        ])
      ],
      providers: [
        { provide: SessionService, useValue: stub.spy },
        { provide: LookupService, useValue: createLookupServiceSpy() }
      ]
    });
    fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
  }

  function personaOptions(): HTMLButtonElement[] {
    return queryAll<HTMLButtonElement>(fixture, '[data-persona-option]');
  }

  function personaMenuIsOpen(): boolean {
    return query(fixture, '.dropdown-menu')?.classList.contains('show') ?? false;
  }

  describe('branding and navigation', () => {
    beforeEach(() => create());

    it('shows the COB + Link text logo', () => {
      expect(textOf(fixture, '.navbar-brand')).toBe('COBLink');
      expect(query(fixture, '.brand-cob')?.textContent).toBe('COB');
      expect(query(fixture, '.brand-link')?.textContent).toBe('Link');
    });

    it('links to the dashboard, the activities and the takebacks', () => {
      const links = queryAll<HTMLAnchorElement>(fixture, 'a.nav-link');

      expect(links.map(link => link.textContent?.trim())).toEqual(['Dashboard', 'Activities', 'Takebacks']);
      expect(links.map(link => link.getAttribute('href'))).toEqual(['/dashboard', '/activities', '/takebacks']);
    });

    it('marks the link of the current page as active', async () => {
      await navigateInZone('/activities');
      await fixture.whenStable();
      fixture.detectChanges();

      const active = queryAll<HTMLAnchorElement>(fixture, 'a.nav-link.active');
      expect(active.map(link => link.textContent?.trim())).toEqual(['Activities']);
      expect(active[0].getAttribute('aria-current')).toBe('page');
    });

    it('opens and closes the collapsed menu of small screens', () => {
      const toggler = query(fixture, '.navbar-toggler');
      const menu = query(fixture, '#main-menu');
      expect(menu?.classList.contains('show')).toBeFalse();
      expect(toggler?.getAttribute('aria-expanded')).toBe('false');

      click(fixture, '.navbar-toggler');
      expect(menu?.classList.contains('show')).toBeTrue();
      expect(toggler?.getAttribute('aria-expanded')).toBe('true');

      click(fixture, '.navbar-toggler');
      expect(menu?.classList.contains('show')).toBeFalse();
    });

    it('only shows the brand until the session is known', () => {
      stub.session$.next(null);
      fixture.detectChanges();

      expect(textOf(fixture, '.navbar-brand')).toBe('COBLink');
      expect(queryAll(fixture, 'a.nav-link')).toEqual([]);
      expect(query(fixture, '[data-current-user]')).toBeNull();
    });
  });

  describe('signed-in user', () => {
    it('shows the display name and the role badge', () => {
      create();

      expect(textOf(fixture, '[data-user-name]')).toBe('Ana Analyst');
      expect(textOf(fixture, '[data-user-role]')).toBe('Analyst');
    });

    it('takes the role name from the lookups', () => {
      create({ user: buildUser({ userId: 3, displayName: 'Ada Admin', role: UserRole.Admin }) });

      expect(textOf(fixture, '[data-user-name]')).toBe('Ada Admin');
      expect(textOf(fixture, '[data-user-role]')).toBe('Administrator');
    });

    it('follows a change of the session', () => {
      create();

      stub.session$.next(
        buildSession({ user: buildUser({ userId: 2, displayName: 'Sam Supervisor', role: UserRole.Supervisor }) })
      );
      fixture.detectChanges();

      expect(textOf(fixture, '[data-user-name]')).toBe('Sam Supervisor');
      expect(textOf(fixture, '[data-user-role]')).toBe('Supervisor');
    });
  });

  describe('persona switcher', () => {
    it('is offered in Development mode', () => {
      create({ mode: 'Development' });

      expect(query(fixture, '[data-persona-switcher]')).not.toBeNull();
      expect(textOf(fixture, '#persona-toggle')).toBe('Switch user');
    });

    it('is not offered in Windows mode', () => {
      create({ mode: 'Windows' });

      expect(query(fixture, '[data-persona-switcher]')).toBeNull();
      expect(query(fixture, '#persona-toggle')).toBeNull();
      expect(stub.spy.getAllUsers).not.toHaveBeenCalled();
    });

    it('does not load the users before the menu is opened', () => {
      create();

      expect(stub.spy.getAllUsers).not.toHaveBeenCalled();
      expect(personaMenuIsOpen()).toBeFalse();
    });

    it('lists every user with display name and role once the menu is opened', () => {
      create();

      click(fixture, '#persona-toggle');

      expect(stub.spy.getAllUsers).toHaveBeenCalledTimes(1);
      expect(personaMenuIsOpen()).toBeTrue();
      expect(query(fixture, '#persona-toggle')?.getAttribute('aria-expanded')).toBe('true');
      expect(
        personaOptions().map(option => Array.from(option.querySelectorAll('span')).map(span => span.textContent?.trim()))
      ).toEqual([
        ['Ana Analyst', 'Analyst'],
        ['Sam Supervisor', 'Supervisor'],
        ['Ada Admin', 'Administrator']
      ]);
    });

    it('requests the users only once however often the menu is toggled', () => {
      create();

      click(fixture, '#persona-toggle');
      click(fixture, '#persona-toggle');
      click(fixture, '#persona-toggle');

      expect(stub.spy.getAllUsers).toHaveBeenCalledTimes(1);
    });

    it('highlights the signed-in user', () => {
      create();
      click(fixture, '#persona-toggle');

      const current = personaOptions().filter(option => option.classList.contains('active'));
      expect(current.length).toBe(1);
      expect(current[0].textContent).toContain('Ana Analyst');
      expect(current[0].getAttribute('aria-current')).toBe('true');
    });

    it('switches the persona when another user is chosen', () => {
      create();
      click(fixture, '#persona-toggle');

      personaOptions()[1].click();
      fixture.detectChanges();

      expect(stub.spy.switchPersona).toHaveBeenCalledOnceWith('COBLINK\\sam.supervisor');
      expect(personaMenuIsOpen()).toBeFalse();
    });

    it('does not reload the page when the signed-in user is chosen again', () => {
      create();
      click(fixture, '#persona-toggle');

      personaOptions()[0].click();
      fixture.detectChanges();

      expect(stub.spy.switchPersona).not.toHaveBeenCalled();
      expect(personaMenuIsOpen()).toBeFalse();
    });

    it('shows the problem when the users cannot be loaded', () => {
      create();
      stub.spy.getAllUsers.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The user list is unavailable.')));

      click(fixture, '#persona-toggle');

      expect(textOf(fixture, '.dropdown-menu')).toContain('The user list is unavailable.');
      expect(personaOptions()).toEqual([]);
    });

    it('closes with the Escape key', () => {
      create();
      click(fixture, '#persona-toggle');
      expect(personaMenuIsOpen()).toBeTrue();

      keydown(query(fixture, '#persona-toggle') as HTMLElement, 'Escape');
      fixture.detectChanges();

      expect(personaMenuIsOpen()).toBeFalse();
    });

    it('closes when the user clicks somewhere else', () => {
      create();
      click(fixture, '#persona-toggle');
      expect(personaMenuIsOpen()).toBeTrue();

      document.body.click();
      fixture.detectChanges();

      expect(personaMenuIsOpen()).toBeFalse();
    });
  });
});
