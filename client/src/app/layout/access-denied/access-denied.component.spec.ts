import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { SessionService } from '../../core/services/session.service';
import { SharedModule } from '../../shared/shared.module';
import { buildSession } from '../../testing/test-data';
import { SessionStub, SessionStubOptions, apiError, createSessionServiceStub } from '../../testing/test-doubles';
import { click, query, textOf } from '../../testing/test-helpers';
import { AccessDeniedComponent } from './access-denied.component';

describe('AccessDeniedComponent', () => {
  let fixture: ComponentFixture<AccessDeniedComponent>;
  let stub: SessionStub;
  let navigate: jasmine.Spy;

  function create(options: SessionStubOptions = {}, arrange: (sessionStub: SessionStub) => void = () => undefined): void {
    stub = createSessionServiceStub(options);
    arrange(stub);
    TestBed.configureTestingModule({
      declarations: [AccessDeniedComponent],
      imports: [SharedModule, RouterTestingModule],
      providers: [{ provide: SessionService, useValue: stub.spy }]
    });
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(AccessDeniedComponent);
    fixture.detectChanges();
  }

  it('shows the message the server gave for the refusal', () => {
    create({ accessDeniedMessage: 'Your account is not registered in COBLink.' });

    expect(textOf(fixture, 'h1')).toBe('Access denied');
    expect(textOf(fixture, '[data-access-message]')).toBe('Your account is not registered in COBLink.');
    expect(stub.spy.getCurrent).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers the default user in Development mode and clears the stored persona on click', () => {
    create({ mode: 'Development', accessDeniedMessage: 'Not allowed.' });

    expect(query(fixture, '[data-use-default-user]')).not.toBeNull();

    click(fixture, '[data-use-default-user]');

    expect(stub.spy.useDefaultUser).toHaveBeenCalledTimes(1);
  });

  it('offers the default user when a persona is stored even though the session is unknown', () => {
    create({ mode: 'Windows', storedPersona: 'COBLINK\\gone.user', accessDeniedMessage: 'Not allowed.' });

    expect(query(fixture, '[data-use-default-user]')).not.toBeNull();
  });

  it('has no default user button in Windows mode without a stored persona', () => {
    create({ mode: 'Windows', accessDeniedMessage: 'Not allowed.' });

    expect(query(fixture, '[data-use-default-user]')).toBeNull();
  });

  it('asks the server why when the page is opened directly and sends the user home if access works', () => {
    create({}, sessionStub => sessionStub.spy.getCurrent.and.returnValue(of(buildSession())));

    expect(stub.spy.getCurrent).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows the server message found by the probe when access is still refused', () => {
    create({}, sessionStub =>
      sessionStub.spy.getCurrent.and.returnValue(throwError(() => apiError('FORBIDDEN', 'The account has been deactivated.')))
    );

    expect(textOf(fixture, '[data-access-message]')).toBe('The account has been deactivated.');
    expect(fixture.componentInstance.checking).toBeFalse();
    expect(navigate).not.toHaveBeenCalled();
  });
});
