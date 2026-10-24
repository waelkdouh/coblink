import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionService } from '../../core/services/session.service';
import { buildSession } from '../../testing/test-data';
import { createSessionServiceStub } from '../../testing/test-doubles';
import { query, textOf } from '../../testing/test-helpers';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;

  function create(): ReturnType<typeof createSessionServiceStub> {
    const stub = createSessionServiceStub();
    TestBed.configureTestingModule({
      declarations: [FooterComponent],
      providers: [{ provide: SessionService, useValue: stub.spy }]
    });
    fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    return stub;
  }

  it('shows the version and the environment of the server', () => {
    create();

    expect(textOf(fixture, '[data-footer-info]')).toBe('Version 1.2.3 · Development');
  });

  it('follows the session', () => {
    const stub = create();

    stub.session$.next(buildSession({ version: '2.0.0', environmentName: 'Production', authenticationMode: 'Windows' }));
    fixture.detectChanges();

    expect(textOf(fixture, '[data-footer-info]')).toBe('Version 2.0.0 · Production');
  });

  it('keeps the application name but no version while the session is unknown', () => {
    const stub = create();

    stub.session$.next(null);
    fixture.detectChanges();

    expect(query(fixture, '[data-footer-info]')).toBeNull();
    expect(textOf(fixture, 'footer')).toContain('COBLink');
  });
});
