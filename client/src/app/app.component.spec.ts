import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { AppComponent } from './app.component';
import { BrowserLocationService } from './core/services/browser-location.service';
import { LookupService } from './core/services/lookup.service';
import { SessionService } from './core/services/session.service';
import { LayoutModule } from './layout/layout.module';
import { ApiError } from './models/api';
import { SessionStub, createLookupServiceSpy, createSessionServiceStub } from './testing/test-doubles';
import { click, query, textOf } from './testing/test-helpers';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let stub: SessionStub;
  let browserLocation: jasmine.SpyObj<BrowserLocationService>;

  beforeEach(() => {
    stub = createSessionServiceStub();
    browserLocation = jasmine.createSpyObj<BrowserLocationService>('BrowserLocationService', ['reload']);
    TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [LayoutModule, RouterTestingModule],
      providers: [
        { provide: SessionService, useValue: stub.spy },
        { provide: LookupService, useValue: createLookupServiceSpy() },
        { provide: BrowserLocationService, useValue: browserLocation }
      ]
    });
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  it('renders the shell around the routed page', () => {
    expect(query(fixture, 'app-navbar')).not.toBeNull();
    expect(query(fixture, 'main#main-content router-outlet')).not.toBeNull();
    expect(query(fixture, 'app-footer')).not.toBeNull();
    expect(query(fixture, 'app-toast-container')).not.toBeNull();
  });

  it('shows no startup error while everything works', () => {
    expect(query(fixture, '[data-startup-error]')).toBeNull();
  });

  it('shows the reason when the application could not be started and offers to try again', () => {
    stub.startupError$.next(new ApiError(0, 'NETWORK', 'Cannot reach the COBLink service. Check your connection and try again.'));
    fixture.detectChanges();

    expect(query(fixture, '[data-startup-error]')?.getAttribute('role')).toBe('alert');
    expect(textOf(fixture, '[data-startup-error]')).toContain('COBLink could not be started');
    expect(textOf(fixture, '[data-startup-error]')).toContain('Cannot reach the COBLink service.');

    click(fixture, '[data-startup-error] button');

    expect(browserLocation.reload).toHaveBeenCalledTimes(1);
  });

  it('hides the startup error again once it is cleared', () => {
    stub.startupError$.next(new ApiError(500, 'SERVER_ERROR', 'Something went wrong.'));
    fixture.detectChanges();
    stub.startupError$.next(null);
    fixture.detectChanges();

    expect(query(fixture, '[data-startup-error]')).toBeNull();
  });

  it('moves the focus to the main content from the skip link without leaving the page', () => {
    const link = query<HTMLAnchorElement>(fixture, 'a.visually-hidden-focusable') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(query(fixture, '#main-content'));
  });
});
