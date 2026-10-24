import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { LookupService } from '../../../core/services/lookup.service';
import { NavigationHistoryService } from '../../../core/services/navigation-history.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TakebackService } from '../../../core/services/takeback.service';
import { TakebackReason, TakebackStatus } from '../../../models/enums';
import { SaveTakebackRequest, Takeback } from '../../../models/models';
import { SharedModule } from '../../../shared/shared.module';
import { addDaysIso, todayIso } from '../../../shared/utils/date-utils';
import { TEST_ROW_VERSION, buildMember, buildProvider, buildTakeback } from '../../../testing/test-data';
import {
  apiError,
  createLookupServiceSpy,
  createNavigationHistorySpy,
  createNotificationServiceSpy,
  createTakebackServiceSpy
} from '../../../testing/test-doubles';
import { click, query, queryAll, selectOption, setValue, submit, textOf } from '../../../testing/test-helpers';
import { TakebackFormComponent } from './takeback-form.component';

describe('TakebackFormComponent', () => {
  let takebacks: jasmine.SpyObj<TakebackService>;
  let lookups: jasmine.SpyObj<LookupService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let history: jasmine.SpyObj<NavigationHistoryService>;
  let navigate: jasmine.Spy;
  let params$: BehaviorSubject<ParamMap>;
  let fixture: ComponentFixture<TakebackFormComponent>;
  let component: TakebackFormComponent;

  function create(id?: string): void {
    params$.next(convertToParamMap(id === undefined ? {} : { id }));
    fixture = TestBed.createComponent(TakebackFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function createForEdit(takeback: Takeback = buildTakeback()): void {
    takebacks.getById.and.returnValue(of(takeback));
    create(String(takeback.takebackId));
  }

  function save(): void {
    click(fixture, '[data-action="save"]');
  }

  function savedRequest(index = 0): SaveTakebackRequest {
    return takebacks.save.calls.argsFor(index)[0];
  }

  function errorsOf(controlId: string): string {
    return textOf(fixture, `#${controlId}-errors`);
  }

  function value(selector: string): string {
    return query<HTMLInputElement | HTMLTextAreaElement>(fixture, selector)?.value ?? '';
  }

  function selectedLabel(selector: string): string {
    const select = query<HTMLSelectElement>(fixture, selector);
    return (select?.selectedOptions[0]?.textContent ?? '').trim();
  }

  function optionLabels(selector: string): string[] {
    return queryAll<HTMLOptionElement>(fixture, `${selector} option`).map(option => (option.textContent ?? '').trim());
  }

  /** Everything a new takeback needs besides the optional fields. */
  function fillRequiredFields(reason = 'Duplicate Payment'): void {
    setValue(fixture, '#takeback-claim', 'CLM-2025-0042');
    selectOption(fixture, '#takeback-reason', reason);
    setValue(fixture, '#takeback-service-date', '2025-01-15');
    component.form.controls.memberId.setValue(11);
    component.form.controls.providerId.setValue(21);
    setValue(fixture, '#takeback-original-paid', '1500');
    setValue(fixture, '#takeback-amount', '1000');
    fixture.detectChanges();
  }

  beforeEach(() => {
    takebacks = createTakebackServiceSpy();
    lookups = createLookupServiceSpy();
    notifications = createNotificationServiceSpy();
    history = createNavigationHistorySpy();
    params$ = new BehaviorSubject<ParamMap>(convertToParamMap({}));
    takebacks.save.and.callFake(request =>
      of(buildTakeback({ takebackId: request.takebackId || 9, takebackNumber: 'TB-000009', claimNumber: request.claimNumber }))
    );

    TestBed.configureTestingModule({
      declarations: [TakebackFormComponent],
      imports: [SharedModule, RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params$.asObservable() } },
        { provide: TakebackService, useValue: takebacks },
        { provide: LookupService, useValue: lookups },
        { provide: NotificationService, useValue: notifications },
        { provide: NavigationHistoryService, useValue: history }
      ]
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  describe('new takeback', () => {
    beforeEach(() => create());

    it('starts empty with a reason to choose and without the other carrier fields', () => {
      expect(textOf(fixture, 'h1')).toBe('New takeback');
      expect(selectedLabel('#takeback-reason')).toBe('Select a reason');
      expect(value('#takeback-claim')).toBe('');
      expect(value('#takeback-original-paid')).toBe('');
      expect(query(fixture, '[data-other-carrier]')).toBeNull();
      expect(query(fixture, '[data-action="save"]')?.textContent).toContain('Create takeback');
    });

    it('fills the reasons from the lookups', () => {
      expect(optionLabels('#takeback-reason')).toEqual([
        'Select a reason',
        'Other Insurance Primary',
        'Medicare Primary',
        'Duplicate Payment',
        'Eligibility Terminated',
        'Third Party Liability',
        'Workers Compensation',
        'Provider Billing Error',
        'Other'
      ]);
    });

    it('labels every field', () => {
      const ids = [
        'takeback-claim',
        'takeback-reason',
        'takeback-service-date',
        'takeback-member',
        'takeback-provider',
        'takeback-original-paid',
        'takeback-amount',
        'takeback-policy',
        'takeback-notes'
      ];

      for (const id of ids) {
        expect(query(fixture, `label[for="${id}"]`)).withContext(id).not.toBeNull();
        expect(query(fixture, `#${id}`)).withContext(id).not.toBeNull();
      }
    });

    it('does not allow a date of service after today', () => {
      expect(query(fixture, '#takeback-service-date')?.getAttribute('max')).toBe(todayIso());

      setValue(fixture, '#takeback-service-date', addDaysIso(todayIso(), 1));
      expect(errorsOf('takeback-service-date')).toBe('The date cannot be in the future.');

      setValue(fixture, '#takeback-service-date', todayIso());
      expect(query(fixture, '#takeback-service-date-errors')).toBeNull();
    });

    it('shows what is missing and does not call the API when Create is pressed on an empty form', () => {
      save();

      expect(takebacks.save).not.toHaveBeenCalled();
      expect(queryAll(fixture, '[data-field-errors]').map(element => (element.textContent ?? '').trim())).toEqual([
        'Claim number is required.',
        'Reason is required.',
        'Date of service is required.',
        'Member is required.',
        'Provider is required.',
        'Original paid amount is required.',
        'Takeback amount is required.'
      ]);
    });

    it('moves the focus to the first field with a problem', () => {
      save();

      expect(document.activeElement?.id).toBe('takeback-claim');
    });

    it('connects the pickers with their messages for screen readers', () => {
      save();

      expect(query(fixture, '#takeback-member')?.getAttribute('aria-describedby')).toBe('takeback-member-errors');
      expect(query(fixture, '#takeback-provider')?.classList).toContain('is-invalid');
      expect(query(fixture, '#takeback-provider-errors')).not.toBeNull();
    });

    describe('claim number', () => {
      it('is required and a blank text does not count', () => {
        setValue(fixture, '#takeback-claim', '   ');

        expect(errorsOf('takeback-claim')).toBe('Claim number is required.');
      });

      it('accepts letters, digits and dashes', () => {
        setValue(fixture, '#takeback-claim', 'clm-2025-0042');

        expect(query(fixture, '#takeback-claim-errors')).toBeNull();
      });

      it('rejects every other character', () => {
        setValue(fixture, '#takeback-claim', 'CLM 2025/42');

        expect(errorsOf('takeback-claim')).toBe('Claim number can only contain letters, digits and dashes.');
      });

      it('is limited to 30 characters', () => {
        setValue(fixture, '#takeback-claim', 'C'.repeat(30));
        expect(query(fixture, '#takeback-claim-errors')).toBeNull();

        setValue(fixture, '#takeback-claim', 'C'.repeat(31));
        expect(errorsOf('takeback-claim')).toBe('Claim number must be at most 30 characters.');
      });
    });

    describe('amounts', () => {
      it('need an original paid amount above zero', () => {
        setValue(fixture, '#takeback-original-paid', '0');
        expect(errorsOf('takeback-original-paid')).toBe('Must be greater than 0.');

        setValue(fixture, '#takeback-original-paid', '-5');
        expect(errorsOf('takeback-original-paid')).toBe('Must be greater than 0.');

        setValue(fixture, '#takeback-original-paid', '0.01');
        expect(query(fixture, '#takeback-original-paid-errors')).toBeNull();
      });

      it('need a takeback amount above zero', () => {
        setValue(fixture, '#takeback-amount', '0');

        expect(errorsOf('takeback-amount')).toBe('Must be greater than 0.');
      });

      it('allow cents but nothing finer', () => {
        setValue(fixture, '#takeback-original-paid', '100.255');
        setValue(fixture, '#takeback-amount', '10.005');

        expect(errorsOf('takeback-original-paid')).toBe('Use at most 2 decimal places.');
        expect(errorsOf('takeback-amount')).toBe('Use at most 2 decimal places.');

        setValue(fixture, '#takeback-original-paid', '100.25');
        setValue(fixture, '#takeback-amount', '10.5');
        expect(query(fixture, '#takeback-original-paid-errors')).toBeNull();
        expect(query(fixture, '#takeback-amount-errors')).toBeNull();
      });

      it('keep the takeback amount at or below the original paid amount', () => {
        setValue(fixture, '#takeback-original-paid', '100');
        setValue(fixture, '#takeback-amount', '100.01');
        expect(errorsOf('takeback-amount')).toBe('Takeback amount cannot be more than the original paid amount.');

        setValue(fixture, '#takeback-amount', '100');
        expect(query(fixture, '#takeback-amount-errors')).toBeNull();
      });

      it('check the takeback amount again when the original paid amount changes', () => {
        setValue(fixture, '#takeback-original-paid', '100');
        setValue(fixture, '#takeback-amount', '80');
        expect(query(fixture, '#takeback-amount-errors')).toBeNull();

        setValue(fixture, '#takeback-original-paid', '50');
        expect(errorsOf('takeback-amount')).toBe('Takeback amount cannot be more than the original paid amount.');

        setValue(fixture, '#takeback-original-paid', '500');
        expect(query(fixture, '#takeback-amount-errors')).toBeNull();
      });

      it('do not compare with an original paid amount that is not there yet', () => {
        setValue(fixture, '#takeback-amount', '999999');

        expect(query(fixture, '#takeback-amount-errors')).toBeNull();
      });
    });

    describe('other carrier', () => {
      it('appears and is required when another insurance is primary', () => {
        selectOption(fixture, '#takeback-reason', 'Other Insurance Primary');

        expect(query(fixture, '[data-other-carrier]')).not.toBeNull();
        expect(query(fixture, '#takeback-carrier')?.getAttribute('aria-required')).toBe('true');
        expect(component.form.controls.otherCarrierName.hasError('required')).toBeTrue();
      });

      it('shows the missing name once the user tried to save', () => {
        selectOption(fixture, '#takeback-reason', 'Other Insurance Primary');

        save();

        expect(errorsOf('takeback-carrier')).toBe('Other carrier name is required.');
      });

      it('does not accept a blank name', () => {
        selectOption(fixture, '#takeback-reason', 'Other Insurance Primary');
        setValue(fixture, '#takeback-carrier', '   ');

        expect(errorsOf('takeback-carrier')).toBe('Other carrier name is required.');
      });

      it('is limited to 150 characters', () => {
        selectOption(fixture, '#takeback-reason', 'Other Insurance Primary');
        setValue(fixture, '#takeback-carrier', 'x'.repeat(151));

        expect(errorsOf('takeback-carrier')).toBe('Other carrier name must be at most 150 characters.');
      });

      it('disappears for every other reason and takes the entered name with it', () => {
        selectOption(fixture, '#takeback-reason', 'Other Insurance Primary');
        setValue(fixture, '#takeback-carrier', 'Acme Health');

        selectOption(fixture, '#takeback-reason', 'Medicare Primary');

        expect(query(fixture, '[data-other-carrier]')).toBeNull();
        expect(component.form.controls.otherCarrierName.value).toBe('');
        expect(component.form.controls.otherCarrierName.valid).toBeTrue();
      });

      it('is not needed to save a takeback for another reason', () => {
        fillRequiredFields('Medicare Primary');

        save();

        expect(takebacks.save).toHaveBeenCalledTimes(1);
      });

      it('blocks the save while it is missing', () => {
        fillRequiredFields('Other Insurance Primary');

        save();

        expect(takebacks.save).not.toHaveBeenCalled();
        expect(document.activeElement?.id).toBe('takeback-carrier');
      });
    });

    describe('optional fields', () => {
      it('limit the policy number to 50 characters and the notes to 2000', () => {
        setValue(fixture, '#takeback-policy', 'p'.repeat(51));
        setValue(fixture, '#takeback-notes', 'n'.repeat(2001));

        expect(errorsOf('takeback-policy')).toBe('Other policy number must be at most 50 characters.');
        expect(errorsOf('takeback-notes')).toBe('Notes must be at most 2000 characters.');
      });

      it('count the characters left for the notes', () => {
        setValue(fixture, '#takeback-notes', 'x'.repeat(150));

        expect(textOf(fixture, '#takeback-notes + .form-text')).toBe('1850 characters remaining');
      });
    });

    describe('saving', () => {
      it('creates the takeback with takebackId 0 and no rowVersion', () => {
        fillRequiredFields();

        save();

        expect(takebacks.save).toHaveBeenCalledTimes(1);
        expect(savedRequest()).toEqual({
          takebackId: 0,
          claimNumber: 'CLM-2025-0042',
          memberId: 11,
          providerId: 21,
          reason: TakebackReason.DuplicatePayment,
          dateOfService: '2025-01-15',
          originalPaidAmount: 1500,
          takebackAmount: 1000,
          otherCarrierName: null,
          otherPolicyNumber: null,
          notes: null,
          rowVersion: null
        });
      });

      it('sends the optional fields as typed: trimmed text and the other carrier for another insurance', () => {
        fillRequiredFields('Other Insurance Primary');
        setValue(fixture, '#takeback-claim', '  CLM-77 ');
        setValue(fixture, '#takeback-carrier', '  Acme Health ');
        setValue(fixture, '#takeback-policy', ' POL-9 ');
        setValue(fixture, '#takeback-notes', '  Duplicate of claim 41.  ');

        save();

        expect(savedRequest()).toEqual(
          jasmine.objectContaining({
            claimNumber: 'CLM-77',
            reason: TakebackReason.OtherInsurancePrimary,
            otherCarrierName: 'Acme Health',
            otherPolicyNumber: 'POL-9',
            notes: 'Duplicate of claim 41.'
          })
        );
      });

      it('sends the date of service as yyyy-MM-dd and the amounts as numbers with cents', () => {
        fillRequiredFields();
        setValue(fixture, '#takeback-service-date', '2024-12-31');
        setValue(fixture, '#takeback-original-paid', '1234.5');
        setValue(fixture, '#takeback-amount', '99.99');

        save();

        expect(savedRequest()).toEqual(
          jasmine.objectContaining({ dateOfService: '2024-12-31', originalPaidAmount: 1234.5, takebackAmount: 99.99 })
        );
      });

      it('shows a toast and opens the detail page of the new takeback after saving', () => {
        fillRequiredFields();

        save();

        expect(notifications.success).toHaveBeenCalledWith('Takeback TB-000009 was created.');
        expect(navigate).toHaveBeenCalledWith(['/takebacks', 9], { replaceUrl: true });
      });

      it('disables the buttons while the request is running and ignores a second submit', () => {
        const pending = new Subject<Takeback>();
        takebacks.save.and.returnValue(pending);
        fillRequiredFields();

        save();
        expect(query<HTMLButtonElement>(fixture, '[data-action="save"]')?.disabled).toBeTrue();
        expect(query<HTMLButtonElement>(fixture, '[data-action="cancel"]')?.disabled).toBeTrue();
        submit(fixture, '[data-takeback-form]');
        expect(takebacks.save).toHaveBeenCalledTimes(1);

        pending.next(buildTakeback({ takebackId: 9, takebackNumber: 'TB-000009' }));
        pending.complete();
        fixture.detectChanges();
        expect(query<HTMLButtonElement>(fixture, '[data-action="save"]')?.disabled).toBeFalse();
      });

      it('returns to the takeback list with Cancel when the page was opened directly', () => {
        click(fixture, '[data-action="cancel"]');

        expect(history.back).toHaveBeenCalledWith('/takebacks');
      });
    });
  });

  describe('server errors', () => {
    beforeEach(() => {
      create();
      fillRequiredFields();
    });

    it('puts validation messages on their fields and the rest into the alert at the top', () => {
      takebacks.save.and.returnValue(
        throwError(() =>
          apiError('VALIDATION', 'Validation failed.', [
            { field: 'claimNumber', message: 'A takeback for this claim and provider already exists.' },
            { field: 'takebackAmount', message: 'The takeback exceeds the paid amount on the claim.' },
            { field: null, message: 'Check the takeback and try again.' },
            { field: 'somethingElse', message: 'A field this form does not have.' }
          ])
        )
      );

      save();

      expect(errorsOf('takeback-claim')).toBe('A takeback for this claim and provider already exists.');
      expect(errorsOf('takeback-amount')).toBe('The takeback exceeds the paid amount on the claim.');
      const alert = textOf(fixture, '[data-form-alert]');
      expect(alert).toContain('Check the takeback and try again.');
      expect(alert).toContain('A field this form does not have.');
      expect(alert).not.toContain('already exists');
      expect(notifications.error).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('moves the focus to the field of the first server message', () => {
      takebacks.save.and.returnValue(
        throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: 'claimNumber', message: 'Duplicate.' }]))
      );

      save();

      expect(document.activeElement?.id).toBe('takeback-claim');
    });

    it('removes the server message of a field as soon as the user edits it', () => {
      takebacks.save.and.returnValue(
        throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: 'claimNumber', message: 'Duplicate.' }]))
      );
      save();
      expect(errorsOf('takeback-claim')).toBe('Duplicate.');

      setValue(fixture, '#takeback-claim', 'CLM-2025-0043');

      expect(query(fixture, '#takeback-claim-errors')).toBeNull();
      expect(component.form.valid).toBeTrue();
    });

    it('maps the other carrier field too', () => {
      selectOption(fixture, '#takeback-reason', 'Other Insurance Primary');
      setValue(fixture, '#takeback-carrier', 'Acme Health');
      takebacks.save.and.returnValue(
        throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: 'otherCarrierName', message: 'Unknown carrier.' }]))
      );

      save();

      expect(errorsOf('takeback-carrier')).toBe('Unknown carrier.');
    });

    it('shows a toast for any other failure and keeps the entered data', () => {
      takebacks.save.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The server could not save the takeback.')));

      save();

      expect(notifications.error).toHaveBeenCalledWith('The server could not save the takeback.');
      expect(value('#takeback-claim')).toBe('CLM-2025-0042');
      expect(query<HTMLButtonElement>(fixture, '[data-action="save"]')?.disabled).toBeFalse();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('clears the alert of an earlier attempt when the user saves again', () => {
      takebacks.save.and.returnValues(
        throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: null, message: 'Check the takeback.' }])),
        of(buildTakeback({ takebackId: 9, takebackNumber: 'TB-000009' }))
      );
      save();
      expect(query(fixture, '[data-form-alert]')).not.toBeNull();

      save();

      expect(query(fixture, '[data-form-alert]')).toBeNull();
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('editing', () => {
    it('loads the takeback into the form', () => {
      createForEdit();

      expect(textOf(fixture, 'h1')).toBe('Edit takeback TB-000007');
      expect(value('#takeback-claim')).toBe('CLM-2025-0042');
      expect(selectedLabel('#takeback-reason')).toBe('Duplicate Payment');
      expect(value('#takeback-service-date')).toBe('2025-01-15');
      expect(value('#takeback-original-paid')).toBe('1500');
      expect(value('#takeback-amount')).toBe('1000');
      expect(value('#takeback-policy')).toBe('');
      expect(query(fixture, '[data-action="save"]')?.textContent).toContain('Save changes');
      expect(takebacks.getById).toHaveBeenCalledOnceWith(7);
    });

    it('shows the member and the provider as chips with their numbers', () => {
      createForEdit();

      expect(textOf(fixture, 'app-member-picker [data-picker="selected"]')).toBe('Maria Lopez (M-0011)');
      expect(textOf(fixture, 'app-provider-picker [data-picker="selected"]')).toBe('Riverside Clinic (P-0021)');
    });

    it('shows the other carrier of a takeback for another insurance', () => {
      createForEdit(
        buildTakeback({
          reason: TakebackReason.OtherInsurancePrimary,
          otherCarrierName: 'Acme Health',
          otherPolicyNumber: 'POL-9',
          notes: 'Called twice.'
        })
      );

      expect(value('#takeback-carrier')).toBe('Acme Health');
      expect(value('#takeback-policy')).toBe('POL-9');
      expect(value('#takeback-notes')).toBe('Called twice.');
    });

    it('sends the takeback id and the rowVersion it loaded, and the date as yyyy-MM-dd', () => {
      createForEdit();
      setValue(fixture, '#takeback-amount', '900.5');

      save();

      expect(savedRequest()).toEqual({
        takebackId: 7,
        claimNumber: 'CLM-2025-0042',
        memberId: 11,
        providerId: 21,
        reason: TakebackReason.DuplicatePayment,
        dateOfService: '2025-01-15',
        originalPaidAmount: 1500,
        takebackAmount: 900.5,
        otherCarrierName: null,
        otherPolicyNumber: null,
        notes: null,
        rowVersion: TEST_ROW_VERSION
      });
    });

    it('sends the other carrier, the policy number and the notes it loaded', () => {
      createForEdit(
        buildTakeback({
          reason: TakebackReason.OtherInsurancePrimary,
          otherCarrierName: 'Acme Health',
          otherPolicyNumber: 'POL-9',
          notes: 'Called twice.'
        })
      );

      save();

      expect(savedRequest()).toEqual(
        jasmine.objectContaining({ otherCarrierName: 'Acme Health', otherPolicyNumber: 'POL-9', notes: 'Called twice.' })
      );
    });

    it('drops the other carrier when the reason changes to another one', () => {
      createForEdit(buildTakeback({ reason: TakebackReason.OtherInsurancePrimary, otherCarrierName: 'Acme Health' }));

      selectOption(fixture, '#takeback-reason', 'Duplicate Payment');
      save();

      expect(savedRequest().reason).toBe(TakebackReason.DuplicatePayment);
      expect(savedRequest().otherCarrierName).toBeNull();
    });

    it('opens the detail page after saving and says so', () => {
      createForEdit();
      takebacks.save.and.returnValue(of(buildTakeback()));

      save();

      expect(notifications.success).toHaveBeenCalledWith('Takeback TB-000007 was saved.');
      expect(navigate).toHaveBeenCalledWith(['/takebacks', 7], { replaceUrl: true });
    });

    it('keeps the record the server returned, so the next save carries its new rowVersion', () => {
      createForEdit();
      takebacks.save.and.returnValue(of(buildTakeback({ rowVersion: 'AAAAAAAAB9I=' })));
      save();
      save();

      expect(savedRequest(0).rowVersion).toBe(TEST_ROW_VERSION);
      expect(savedRequest(1).rowVersion).toBe('AAAAAAAAB9I=');
    });

    it('returns to the takeback with Cancel', () => {
      createForEdit();

      click(fixture, '[data-action="cancel"]');

      expect(history.back).toHaveBeenCalledWith('/takebacks/7');
    });

    it('offers the form for a rejected takeback because the server allows Edit', () => {
      createForEdit(buildTakeback({ status: TakebackStatus.Rejected, availableActions: ['Edit', 'Submit', 'Cancel'] }));

      expect(query(fixture, '[data-takeback-form]')).not.toBeNull();
      expect(query(fixture, '[data-read-only]')).toBeNull();
    });

    it('does not offer the form for a takeback the server does not allow to edit', () => {
      createForEdit(buildTakeback({ status: TakebackStatus.Approved, availableActions: ['SendNotice', 'Cancel'] }));

      expect(query(fixture, '[data-takeback-form]')).toBeNull();
      expect(textOf(fixture, '[data-read-only]')).toContain('This takeback is approved and cannot be edited.');
      expect(query(fixture, '[data-read-only] a')?.getAttribute('href')).toBe('/takebacks/7');
    });

    it('shows the concurrency panel instead of a toast when somebody else changed the takeback', () => {
      createForEdit();
      takebacks.save.and.returnValue(throwError(() => apiError('CONCURRENCY', 'The takeback was changed by another user.')));

      save();

      expect(textOf(fixture, '[data-concurrency-panel]')).toContain('This record was changed by another user');
      expect(notifications.error).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('reloads the current version on request and then saves against it', () => {
      createForEdit();
      takebacks.save.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed.')));
      setValue(fixture, '#takeback-claim', 'MY-EDIT');
      save();
      takebacks.getById.and.returnValue(of(buildTakeback({ claimNumber: 'CLM-BY-COLLEAGUE', rowVersion: 'AAAAAAAAB9I=' })));

      click(fixture, '[data-concurrency-panel] button');

      expect(takebacks.getById).toHaveBeenCalledTimes(2);
      expect(query(fixture, '[data-concurrency-panel]')).toBeNull();
      expect(value('#takeback-claim')).toBe('CLM-BY-COLLEAGUE');

      takebacks.save.and.returnValue(of(buildTakeback({ rowVersion: 'AAAAAAAAB9M=' })));
      save();
      expect(takebacks.save.calls.mostRecent().args[0].rowVersion).toBe('AAAAAAAAB9I=');
    });

    it('keeps the panel and reports the problem when the reload fails', () => {
      createForEdit();
      takebacks.save.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed.')));
      save();
      takebacks.getById.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The takeback could not be loaded.')));

      click(fixture, '[data-concurrency-panel] button');

      expect(notifications.error).toHaveBeenCalledWith('The takeback could not be loaded.');
      expect(query(fixture, '[data-concurrency-panel]')).not.toBeNull();
    });
  });

  describe('pickers', () => {
    it('picks the member with the typeahead and sends its id', fakeAsync(() => {
      lookups.searchMembers.and.returnValue(of([buildMember()]));
      create();
      const input = query<HTMLInputElement>(fixture, '#takeback-member') as HTMLInputElement;

      input.value = 'lop';
      input.dispatchEvent(new Event('input'));
      tick(250);
      fixture.detectChanges();
      click(fixture, 'app-member-picker [role="option"]');

      expect(lookups.searchMembers).toHaveBeenCalledWith('lop');
      expect(textOf(fixture, 'app-member-picker [data-picker="selected"]')).toBe('Maria Lopez (M-0011)');
      expect(component.form.controls.memberId.value).toBe(11);
      fixture.destroy();
    }));

    it('picks the provider with the typeahead and sends its id', fakeAsync(() => {
      lookups.searchProviders.and.returnValue(of([buildProvider()]));
      create();
      const input = query<HTMLInputElement>(fixture, '#takeback-provider') as HTMLInputElement;

      input.value = 'river';
      input.dispatchEvent(new Event('input'));
      tick(250);
      fixture.detectChanges();
      click(fixture, 'app-provider-picker [role="option"]');

      expect(lookups.searchProviders).toHaveBeenCalledWith('river');
      expect(textOf(fixture, 'app-provider-picker [data-picker="selected"]')).toBe('Riverside Clinic (P-0021)');
      expect(component.form.controls.providerId.value).toBe(21);
      fixture.destroy();
    }));

    it('lets the user remove the provider again, which makes the provider required once more', () => {
      createForEdit();

      click(fixture, 'app-provider-picker [data-picker="selected"] + .btn-close');
      save();

      expect(component.form.controls.providerId.value).toBeNull();
      expect(takebacks.save).not.toHaveBeenCalled();
      expect(errorsOf('takeback-provider')).toBe('Provider is required.');
    });
  });

  describe('loading problems', () => {
    it('reports a takeback that does not exist', () => {
      takebacks.getById.and.returnValue(throwError(() => apiError('NOT_FOUND', 'Takeback 99 was not found.')));

      create('99');

      expect(textOf(fixture, '[data-load-error]')).toContain('Takeback 99 was not found.');
      expect(query(fixture, '[data-load-error] a')?.getAttribute('href')).toBe('/takebacks');
      expect(query(fixture, '[data-takeback-form]')).toBeNull();
    });

    it('does not ask the API for an id that is not a number', () => {
      create('abc');

      expect(takebacks.getById).not.toHaveBeenCalled();
      expect(textOf(fixture, '[data-load-error]')).toContain('Takeback not found.');
    });

    it('shows a spinner while the takeback is loading', () => {
      const pending = new Subject<Takeback>();
      takebacks.getById.and.returnValue(pending);
      create('7');
      expect(query(fixture, 'app-loading-spinner')).not.toBeNull();
      expect(query(fixture, '[data-takeback-form]')).toBeNull();

      pending.next(buildTakeback());
      fixture.detectChanges();

      expect(query(fixture, 'app-loading-spinner')).toBeNull();
      expect(query(fixture, '[data-takeback-form]')).not.toBeNull();
    });

    it('starts over with an empty form when the route changes from a takeback to a new one', () => {
      createForEdit();
      expect(value('#takeback-claim')).toBe('CLM-2025-0042');

      params$.next(convertToParamMap({}));
      fixture.detectChanges();

      expect(textOf(fixture, 'h1')).toBe('New takeback');
      expect(value('#takeback-claim')).toBe('');
      expect(component.takeback).toBeNull();
    });
  });
});
