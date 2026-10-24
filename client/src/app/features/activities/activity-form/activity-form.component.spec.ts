import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { ActivityService } from '../../../core/services/activity.service';
import { LookupService } from '../../../core/services/lookup.service';
import { NavigationHistoryService } from '../../../core/services/navigation-history.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SessionService } from '../../../core/services/session.service';
import { TakebackService } from '../../../core/services/takeback.service';
import { ActivityPriority, ActivityStatus, ActivityType } from '../../../models/enums';
import { Activity, SaveActivityRequest } from '../../../models/models';
import { SharedModule } from '../../../shared/shared.module';
import { addDaysIso, todayIso } from '../../../shared/utils/date-utils';
import { TEST_ROW_VERSION, buildActivity, buildMember, buildTakeback } from '../../../testing/test-data';
import {
  SessionStub,
  apiError,
  createActivityServiceSpy,
  createLookupServiceSpy,
  createNavigationHistorySpy,
  createNotificationServiceSpy,
  createSessionServiceStub,
  createTakebackServiceSpy
} from '../../../testing/test-doubles';
import { click, query, queryAll, selectOption, setValue, submit, textOf } from '../../../testing/test-helpers';
import { ActivityFormComponent } from './activity-form.component';

describe('ActivityFormComponent', () => {
  let activities: jasmine.SpyObj<ActivityService>;
  let takebacks: jasmine.SpyObj<TakebackService>;
  let lookups: jasmine.SpyObj<LookupService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let history: jasmine.SpyObj<NavigationHistoryService>;
  let session: SessionStub;
  let navigate: jasmine.Spy;
  let params$: BehaviorSubject<ParamMap>;
  let queryParams$: BehaviorSubject<ParamMap>;
  let fixture: ComponentFixture<ActivityFormComponent>;
  let component: ActivityFormComponent;

  function create(route: { id?: string; query?: Record<string, string> } = {}): void {
    params$.next(convertToParamMap(route.id === undefined ? {} : { id: route.id }));
    queryParams$.next(convertToParamMap(route.query ?? {}));
    fixture = TestBed.createComponent(ActivityFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function createForEdit(activity: Activity = buildActivity()): void {
    activities.getById.and.returnValue(of(activity));
    create({ id: String(activity.activityId) });
  }

  function createFromTakeback(): void {
    takebacks.getById.and.returnValue(of(buildTakeback()));
    create({ query: { takebackId: '7' } });
  }

  function save(): void {
    click(fixture, '[data-action="save"]');
  }

  function savedRequest(index = 0): SaveActivityRequest {
    return activities.save.calls.argsFor(index)[0];
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

  /** A type and a subject are all a new activity needs besides the defaults; most tests also pick member 11. */
  function fillRequiredFields(): void {
    selectOption(fixture, '#activity-type', 'Phone Call');
    setValue(fixture, '#activity-subject', 'Call the member');
    component.form.controls.memberId.setValue(11);
    fixture.detectChanges();
  }

  beforeEach(() => {
    activities = createActivityServiceSpy();
    takebacks = createTakebackServiceSpy();
    lookups = createLookupServiceSpy();
    notifications = createNotificationServiceSpy();
    history = createNavigationHistorySpy();
    session = createSessionServiceStub();
    params$ = new BehaviorSubject<ParamMap>(convertToParamMap({}));
    queryParams$ = new BehaviorSubject<ParamMap>(convertToParamMap({}));
    activities.save.and.callFake(request =>
      of(buildActivity({ activityId: request.activityId || 9, activityNumber: 'ACT-000009', subject: request.subject }))
    );

    TestBed.configureTestingModule({
      declarations: [ActivityFormComponent],
      imports: [SharedModule, RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params$.asObservable(), queryParamMap: queryParams$.asObservable() } },
        { provide: ActivityService, useValue: activities },
        { provide: TakebackService, useValue: takebacks },
        { provide: LookupService, useValue: lookups },
        { provide: SessionService, useValue: session.spy },
        { provide: NotificationService, useValue: notifications },
        { provide: NavigationHistoryService, useValue: history }
      ]
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  describe('new activity', () => {
    beforeEach(() => create());

    it('starts with normal priority, status Open and the signed-in user as assignee', () => {
      expect(textOf(fixture, 'h1')).toBe('New activity');
      expect(selectedLabel('#activity-type')).toBe('Select a type');
      expect(selectedLabel('#activity-priority')).toBe('Normal');
      expect(selectedLabel('#activity-status')).toBe('Open');
      expect(selectedLabel('#activity-assignee')).toBe('Ana Analyst');
      expect(value('#activity-subject')).toBe('');
      expect(query(fixture, '[data-action="save"]')?.textContent).toContain('Create activity');
    });

    it('fills the dropdowns from the lookups and the active users', () => {
      expect(optionLabels('#activity-type').slice(0, 3)).toEqual(['Select a type', 'Phone Call', 'Email']);
      expect(optionLabels('#activity-priority')).toEqual(['Select a priority', 'Low', 'Normal', 'High', 'Urgent']);
      expect(optionLabels('#activity-assignee')).toEqual(['Unassigned', 'Ana Analyst', 'Sam Supervisor', 'Ada Admin']);
    });

    it('offers only the statuses Open and In Progress', () => {
      expect(optionLabels('#activity-status')).toEqual(['Open', 'In Progress']);
    });

    it('does not allow a due date before today', () => {
      expect(query(fixture, '#activity-due-date')?.getAttribute('min')).toBe(todayIso());

      setValue(fixture, '#activity-due-date', addDaysIso(todayIso(), -1));
      expect(errorsOf('activity-due-date')).toBe('The date cannot be in the past.');

      setValue(fixture, '#activity-due-date', todayIso());
      expect(query(fixture, '#activity-due-date-errors')).toBeNull();
    });

    it('labels every field', () => {
      const ids = ['activity-type', 'activity-priority', 'activity-status', 'activity-subject', 'activity-description', 'activity-assignee', 'activity-due-date', 'activity-member'];

      for (const id of ids) {
        expect(query(fixture, `label[for="${id}"]`)).withContext(id).not.toBeNull();
        expect(query(fixture, `#${id}`)).withContext(id).not.toBeNull();
      }
    });

    it('shows what is missing and does not call the API when Create is pressed on an empty form', () => {
      save();

      expect(activities.save).not.toHaveBeenCalled();
      expect(queryAll(fixture, '[data-field-errors]').map(element => (element.textContent ?? '').trim())).toEqual([
        'Activity type is required.',
        'Subject is required.'
      ]);
    });

    it('moves the focus to the first field with a problem', () => {
      save();

      expect(document.activeElement?.id).toBe('activity-type');
    });

    it('connects a field with its message for screen readers', () => {
      save();

      expect(query(fixture, '#activity-subject')?.getAttribute('aria-describedby')).toBe('activity-subject-errors');
      expect(query(fixture, '#activity-subject')?.classList).toContain('is-invalid');
      expect(query(fixture, '#activity-subject-errors')).not.toBeNull();
    });

    it('rejects a subject that only consists of blanks', () => {
      setValue(fixture, '#activity-subject', '    ');

      expect(errorsOf('activity-subject')).toBe('Subject is required.');
    });

    it('limits the subject to 200 characters and counts down near the limit', () => {
      setValue(fixture, '#activity-subject', 'x'.repeat(170));
      expect(textOf(fixture, '#activity-subject + .form-text')).toBe('30 characters remaining');
      expect(query(fixture, '#activity-subject-errors')).toBeNull();

      setValue(fixture, '#activity-subject', 'x'.repeat(201));
      expect(errorsOf('activity-subject')).toBe('Subject must be at most 200 characters.');
    });

    it('limits the description to 4000 characters', () => {
      setValue(fixture, '#activity-description', 'x'.repeat(4000));
      expect(query(fixture, '#activity-description-errors')).toBeNull();

      setValue(fixture, '#activity-description', 'x'.repeat(4001));
      expect(errorsOf('activity-description')).toBe('Description must be at most 4000 characters.');
    });

    it('offers the optional member picker as long as no takeback is linked', () => {
      expect(query(fixture, '[data-member-field] app-member-picker')).not.toBeNull();
      expect(query(fixture, '[data-linked-takeback]')).toBeNull();
      expect(query(fixture, 'label[for="activity-member"] .text-danger')).toBeNull();
    });

    it('creates a general activity without a member or takeback', () => {
      selectOption(fixture, '#activity-type', 'Phone Call');
      setValue(fixture, '#activity-subject', 'Quarterly documentation audit');

      save();

      expect(activities.save).toHaveBeenCalledTimes(1);
      expect(savedRequest()).toEqual(jasmine.objectContaining({ memberId: null, takebackId: null }));
      expect(query(fixture, '[data-field-errors]')).toBeNull();
    });

    it('creates the activity with the defaults and sends no rowVersion', () => {
      fillRequiredFields();

      save();

      expect(activities.save).toHaveBeenCalledTimes(1);
      expect(savedRequest()).toEqual({
        activityId: 0,
        memberId: 11,
        takebackId: null,
        activityType: ActivityType.PhoneCall,
        priority: ActivityPriority.Normal,
        status: ActivityStatus.Open,
        subject: 'Call the member',
        description: null,
        assignedToUserId: 1,
        dueDate: null,
        rowVersion: null
      });
    });

    it('sends every field as typed: trimmed text and the due date as yyyy-MM-dd', () => {
      const due = addDaysIso(todayIso(), 7);
      fillRequiredFields();
      selectOption(fixture, '#activity-priority', 'High');
      selectOption(fixture, '#activity-status', 'In Progress');
      selectOption(fixture, '#activity-assignee', 'Sam Supervisor');
      setValue(fixture, '#activity-subject', '  Call the member  ');
      setValue(fixture, '#activity-description', '  Ask about the second policy.  ');
      setValue(fixture, '#activity-due-date', due);

      save();

      expect(savedRequest()).toEqual({
        activityId: 0,
        memberId: 11,
        takebackId: null,
        activityType: ActivityType.PhoneCall,
        priority: ActivityPriority.High,
        status: ActivityStatus.InProgress,
        subject: 'Call the member',
        description: 'Ask about the second policy.',
        assignedToUserId: 2,
        dueDate: due,
        rowVersion: null
      });
    });

    it('can create an unassigned activity', () => {
      fillRequiredFields();
      selectOption(fixture, '#activity-assignee', 'Unassigned');

      save();

      expect(savedRequest().assignedToUserId).toBeNull();
    });

    it('shows a toast and opens the detail page of the new activity after saving', () => {
      fillRequiredFields();

      save();

      expect(notifications.success).toHaveBeenCalledWith('Activity ACT-000009 was created.');
      expect(navigate).toHaveBeenCalledWith(['/activities', 9], { replaceUrl: true });
    });

    it('disables the buttons while the request is running and ignores a second submit', () => {
      const pending = new Subject<Activity>();
      activities.save.and.returnValue(pending);
      fillRequiredFields();

      save();
      expect(query<HTMLButtonElement>(fixture, '[data-action="save"]')?.disabled).toBeTrue();
      expect(query<HTMLButtonElement>(fixture, '[data-action="cancel"]')?.disabled).toBeTrue();
      submit(fixture, '[data-activity-form]');
      expect(activities.save).toHaveBeenCalledTimes(1);

      pending.next(buildActivity({ activityId: 9, activityNumber: 'ACT-000009' }));
      pending.complete();
      fixture.detectChanges();
      expect(query<HTMLButtonElement>(fixture, '[data-action="save"]')?.disabled).toBeFalse();
    });

    it('returns to the activity list with Cancel when the page was opened directly', () => {
      click(fixture, '[data-action="cancel"]');

      expect(history.back).toHaveBeenCalledWith('/activities');
    });
  });

  describe('server errors', () => {
    beforeEach(() => {
      create();
      fillRequiredFields();
    });

    it('puts validation messages on their fields and the rest into the alert at the top', () => {
      activities.save.and.returnValue(
        throwError(() =>
          apiError('VALIDATION', 'Validation failed.', [
            { field: 'subject', message: 'Another open activity has this subject.' },
            { field: 'dueDate', message: 'The due date is not a working day.' },
            { field: null, message: 'Check the activity and try again.' },
            { field: 'somethingElse', message: 'A field this form does not have.' }
          ])
        )
      );

      save();

      expect(errorsOf('activity-subject')).toBe('Another open activity has this subject.');
      expect(errorsOf('activity-due-date')).toBe('The due date is not a working day.');
      const alert = textOf(fixture, '[data-form-alert]');
      expect(alert).toContain('Check the activity and try again.');
      expect(alert).toContain('A field this form does not have.');
      expect(alert).not.toContain('Another open activity');
      expect(notifications.error).not.toHaveBeenCalled();
    });

    it('moves the focus to the field of the first server message', () => {
      activities.save.and.returnValue(
        throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: 'subject', message: 'Not unique.' }]))
      );

      save();

      expect(document.activeElement?.id).toBe('activity-subject');
    });

    it('removes the server message of a field as soon as the user edits it', () => {
      activities.save.and.returnValue(
        throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: 'subject', message: 'Not unique.' }]))
      );
      save();
      expect(errorsOf('activity-subject')).toBe('Not unique.');

      setValue(fixture, '#activity-subject', 'A different subject');

      expect(query(fixture, '#activity-subject-errors')).toBeNull();
      expect(component.form.valid).toBeTrue();
    });

    it('shows a toast for any other failure and keeps the entered data', () => {
      activities.save.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The server could not save the activity.')));

      save();

      expect(notifications.error).toHaveBeenCalledWith('The server could not save the activity.');
      expect(value('#activity-subject')).toBe('Call the member');
      expect(query<HTMLButtonElement>(fixture, '[data-action="save"]')?.disabled).toBeFalse();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('editing', () => {
    it('loads the activity into the form', () => {
      createForEdit(buildActivity({ status: ActivityStatus.InProgress, priority: ActivityPriority.Urgent }));

      expect(activities.getById).toHaveBeenCalledWith(5);
      expect(textOf(fixture, 'h1')).toBe('Edit activity ACT-000005');
      expect(selectedLabel('#activity-type')).toBe('Phone Call');
      expect(selectedLabel('#activity-priority')).toBe('Urgent');
      expect(selectedLabel('#activity-status')).toBe('In Progress');
      expect(value('#activity-subject')).toBe('Verify other coverage');
      expect(value('#activity-description')).toBe('Ask about the second policy.');
      expect(selectedLabel('#activity-assignee')).toBe('Ana Analyst');
      expect(value('#activity-due-date')).toBe('2025-03-14');
      expect(textOf(fixture, '[data-picker="selected"]')).toBe('Maria Lopez (M-0011)');
      expect(query(fixture, '[data-action="save"]')?.textContent).toContain('Save changes');
    });

    it('accepts a due date in the past because the activity may already be late', () => {
      createForEdit();

      expect(query(fixture, '#activity-due-date')?.getAttribute('min')).toBeNull();
      save();

      expect(activities.save).toHaveBeenCalledTimes(1);
    });

    it('sends the activity id and the rowVersion it loaded, and the date as yyyy-MM-dd', () => {
      createForEdit();
      setValue(fixture, '#activity-subject', 'Verify the second policy');

      save();

      expect(savedRequest()).toEqual({
        activityId: 5,
        memberId: 11,
        takebackId: null,
        activityType: ActivityType.PhoneCall,
        priority: ActivityPriority.Normal,
        status: ActivityStatus.Open,
        subject: 'Verify the second policy',
        description: 'Ask about the second policy.',
        assignedToUserId: 1,
        dueDate: '2025-03-14',
        rowVersion: TEST_ROW_VERSION
      });
    });

    it('sends a cleared description and due date as null', () => {
      createForEdit();
      setValue(fixture, '#activity-description', '   ');
      setValue(fixture, '#activity-due-date', '');

      save();

      expect(savedRequest().description).toBeNull();
      expect(savedRequest().dueDate).toBeNull();
    });

    it('opens the detail page after saving and says so', () => {
      createForEdit();

      save();

      expect(notifications.success).toHaveBeenCalledWith('Activity ACT-000009 was saved.');
      expect(navigate).toHaveBeenCalledWith(['/activities', 5], { replaceUrl: true });
    });

    it('keeps the record the server returned, so the next save carries its new rowVersion', () => {
      createForEdit();
      activities.save.and.returnValues(
        of(buildActivity({ rowVersion: 'AAAAAAAAB9I=' })),
        of(buildActivity({ rowVersion: 'AAAAAAAAB9M=' }))
      );

      save();
      save();

      expect(savedRequest(0).rowVersion).toBe(TEST_ROW_VERSION);
      expect(savedRequest(1).rowVersion).toBe('AAAAAAAAB9I=');
    });

    it('keeps the member of an activity that is linked to a takeback out of the form', () => {
      createForEdit(buildActivity({ memberId: null, memberNumber: null, memberName: null, takebackId: 7, takebackNumber: 'TB-000007' }));

      expect(value('#activity-takeback')).toBe('TB-000007');
      expect(query(fixture, 'app-member-picker')).toBeNull();
      save();

      expect(savedRequest()).toEqual(jasmine.objectContaining({ memberId: null, takebackId: 7 }));
    });

    it('keeps a former assignee in the list so saving does not silently reassign the activity', () => {
      createForEdit(buildActivity({ assignedToUserId: 99, assignedToName: 'Former Colleague' }));

      expect(optionLabels('#activity-assignee')).toContain('Former Colleague (inactive)');
      expect(selectedLabel('#activity-assignee')).toBe('Former Colleague (inactive)');
    });

    it('returns to the activity with Cancel', () => {
      createForEdit();

      click(fixture, '[data-action="cancel"]');

      expect(history.back).toHaveBeenCalledWith('/activities/5');
    });

    it('does not offer the form for an activity that cannot be edited', () => {
      createForEdit(buildActivity({ status: ActivityStatus.Completed, availableActions: ['Reopen'] }));

      expect(textOf(fixture, '[data-read-only]')).toContain('This activity is completed and cannot be edited.');
      expect(textOf(fixture, '[data-read-only]')).toContain('Reopen it from the detail page first.');
      expect(query(fixture, '[data-activity-form]')).toBeNull();
      expect(query(fixture, '[data-read-only] a')?.getAttribute('href')).toBe('/activities/5');
    });

    it('explains the permission rule, not the status, when the user may not change an open activity', () => {
      createForEdit(buildActivity({ status: ActivityStatus.InProgress, availableActions: ['AddNote'] }));

      const message = textOf(fixture, '[data-read-only]');
      expect(message).toContain('You cannot edit this activity.');
      expect(message).toContain('created or that are assigned to them');
      expect(message).not.toContain('Reopen');
      expect(query(fixture, '[data-activity-form]')).toBeNull();
    });

    it('shows the concurrency panel instead of a toast when somebody else changed the activity', () => {
      createForEdit();
      activities.save.and.returnValue(throwError(() => apiError('CONCURRENCY', 'The activity was changed by another user.')));

      save();

      expect(textOf(fixture, '[data-concurrency-panel]')).toContain('This record was changed by another user');
      expect(notifications.error).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('reloads the current version on request and then saves against it', () => {
      createForEdit();
      activities.save.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed.')));
      setValue(fixture, '#activity-subject', 'My unsaved edit');
      save();
      activities.getById.and.returnValue(of(buildActivity({ subject: 'Changed by a colleague', rowVersion: 'AAAAAAAAB9I=' })));

      click(fixture, '[data-concurrency-panel] button');

      expect(activities.getById).toHaveBeenCalledTimes(2);
      expect(query(fixture, '[data-concurrency-panel]')).toBeNull();
      expect(value('#activity-subject')).toBe('Changed by a colleague');

      activities.save.and.returnValue(of(buildActivity({ rowVersion: 'AAAAAAAAB9M=' })));
      save();
      expect(activities.save.calls.mostRecent().args[0].rowVersion).toBe('AAAAAAAAB9I=');
    });

    it('keeps the panel and reports the problem when the reload fails', () => {
      createForEdit();
      activities.save.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed.')));
      save();
      activities.getById.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The activity could not be loaded.')));

      click(fixture, '[data-concurrency-panel] button');

      expect(notifications.error).toHaveBeenCalledWith('The activity could not be loaded.');
      expect(query(fixture, '[data-concurrency-panel]')).not.toBeNull();
    });
  });

  describe('linked takeback', () => {
    it('shows the takeback number read-only and no member picker', () => {
      createFromTakeback();

      expect(takebacks.getById).toHaveBeenCalledWith(7);
      expect(query<HTMLInputElement>(fixture, '#activity-takeback')?.readOnly).toBeTrue();
      expect(value('#activity-takeback')).toBe('TB-000007');
      expect(textOf(fixture, '#activity-takeback-hint')).toBe('The member comes from the takeback: Maria Lopez.');
      expect(query(fixture, 'app-member-picker')).toBeNull();
      expect(query(fixture, '[data-linked-takeback] a')?.getAttribute('href')).toBe('/takebacks/7');
    });

    it('needs no member of its own', () => {
      createFromTakeback();
      selectOption(fixture, '#activity-type', 'Letter');
      setValue(fixture, '#activity-subject', 'Send the notice');

      save();

      expect(savedRequest()).toEqual(jasmine.objectContaining({ activityId: 0, memberId: null, takebackId: 7, activityType: ActivityType.Letter }));
    });

    it('ignores a member id in the URL because the member comes from the takeback', () => {
      takebacks.getById.and.returnValue(of(buildTakeback()));
      create({ query: { takebackId: '7', memberId: '11' } });
      selectOption(fixture, '#activity-type', 'Letter');
      setValue(fixture, '#activity-subject', 'Send the notice');

      save();

      expect(savedRequest().memberId).toBeNull();
    });

    it('returns to the takeback with Cancel', () => {
      createFromTakeback();

      click(fixture, '[data-action="cancel"]');

      expect(history.back).toHaveBeenCalledWith('/takebacks/7');
    });

    it('reports a takeback that cannot be loaded instead of showing the form', () => {
      takebacks.getById.and.returnValue(throwError(() => apiError('NOT_FOUND', 'Takeback 7 was not found.')));

      create({ query: { takebackId: '7' } });

      expect(textOf(fixture, '[data-load-error]')).toContain('Takeback 7 was not found.');
      expect(query(fixture, '[data-activity-form]')).toBeNull();
    });
  });

  describe('member picker', () => {
    it('picks the member with the typeahead and sends its id', fakeAsync(() => {
      lookups.searchMembers.and.returnValue(of([buildMember()]));
      create();
      const input = query<HTMLInputElement>(fixture, '#activity-member') as HTMLInputElement;

      input.value = 'lop';
      input.dispatchEvent(new Event('input'));
      tick(250);
      fixture.detectChanges();
      click(fixture, '[role="option"]');

      expect(lookups.searchMembers).toHaveBeenCalledWith('lop');
      expect(textOf(fixture, '[data-picker="selected"]')).toBe('Maria Lopez (M-0011)');
      expect(component.form.controls.memberId.value).toBe(11);
      fixture.destroy();
    }));

    it('starts with the member of the URL', () => {
      create({ query: { memberId: '11' } });

      expect(component.form.controls.memberId.value).toBe(11);
      expect(textOf(fixture, '[data-picker="selected"]')).toBe('Member #11');
    });

    it('sends the preselected member with the new activity', () => {
      create({ query: { memberId: '11' } });
      selectOption(fixture, '#activity-type', 'Email');
      setValue(fixture, '#activity-subject', 'Write to the member');

      save();

      expect(savedRequest().memberId).toBe(11);
    });

    it('refuses to save while text typed into the picker was never picked', () => {
      create();
      selectOption(fixture, '#activity-type', 'Email');
      setValue(fixture, '#activity-subject', 'Write to the member');
      setValue(fixture, '#activity-member', 'lop');

      save();

      expect(activities.save).not.toHaveBeenCalled();
      expect(errorsOf('activity-member')).toBe('Pick a member from the list or clear the text.');
    });

    it('lets the user remove the member again and save a general activity', () => {
      create({ query: { memberId: '11' } });
      selectOption(fixture, '#activity-type', 'Email');
      setValue(fixture, '#activity-subject', 'Quarterly audit');

      click(fixture, '[data-picker="selected"] + .btn-close');
      save();

      expect(component.form.controls.memberId.value).toBeNull();
      expect(query(fixture, '#activity-member-errors')).toBeNull();
      expect(savedRequest().memberId).toBeNull();
    });
  });

  describe('loading problems', () => {
    it('reports an activity that does not exist', () => {
      activities.getById.and.returnValue(throwError(() => apiError('NOT_FOUND', 'Activity 99 was not found.')));

      create({ id: '99' });

      expect(textOf(fixture, '[data-load-error]')).toContain('Activity 99 was not found.');
      expect(query(fixture, '[data-load-error] a')?.getAttribute('href')).toBe('/activities');
      expect(query(fixture, '[data-activity-form]')).toBeNull();
    });

    it('does not ask the API for an id that is not a number', () => {
      create({ id: 'abc' });

      expect(activities.getById).not.toHaveBeenCalled();
      expect(textOf(fixture, '[data-load-error]')).toContain('Activity not found.');
    });

    it('reports a failure to load the assignees', () => {
      session.spy.getAllUsers.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The user list is unavailable.')));

      create();

      expect(textOf(fixture, '[data-load-error]')).toContain('The user list is unavailable.');
    });

    it('shows a spinner while the activity is loading', () => {
      activities.getById.and.returnValue(new Subject<Activity>());

      create({ id: '5' });

      expect(query(fixture, 'app-loading-spinner')).not.toBeNull();
      expect(query(fixture, '[data-activity-form]')).toBeNull();
    });
  });
});
