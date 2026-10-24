import { formatDate } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { ActivityService } from '../../../core/services/activity.service';
import { LookupService } from '../../../core/services/lookup.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActivityPriority, ActivityStatus } from '../../../models/enums';
import { Activity } from '../../../models/models';
import { SharedModule } from '../../../shared/shared.module';
import { TEST_ROW_VERSION, TEST_TIMESTAMP, buildActivity, buildNote } from '../../../testing/test-data';
import {
  apiError,
  createActivityServiceSpy,
  createLookupServiceSpy,
  createNotificationServiceSpy
} from '../../../testing/test-doubles';
import { click, keydown, query, queryAll, setValue, submit, textOf } from '../../../testing/test-helpers';
import { ActivityDetailComponent } from './activity-detail.component';

const NEW_ROW_VERSION = 'AAAAAAAAB9I=';

describe('ActivityDetailComponent', () => {
  let activities: jasmine.SpyObj<ActivityService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let params$: BehaviorSubject<ParamMap>;
  let fixture: ComponentFixture<ActivityDetailComponent>;
  let component: ActivityDetailComponent;

  function create(activity: Activity = buildActivity()): void {
    fixture?.destroy();
    activities.getById.and.returnValue(of(activity));
    params$.next(convertToParamMap({ id: String(activity.activityId) }));
    fixture = TestBed.createComponent(ActivityDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** A timestamp as the date pipe shows it in the local time zone (white space collapsed like the helpers do). */
  function localTime(timestamp: string): string {
    return formatDate(timestamp, 'medium', 'en-US').replace(/\s+/g, ' ');
  }

  function value(selector: string): string {
    return query<HTMLTextAreaElement>(fixture, selector)?.value ?? '';
  }

  function actionButtons(): string[] {
    return queryAll(fixture, '[data-actions] [data-action]').map(element => element.getAttribute('data-action') ?? '');
  }

  /** Text of the value that belongs to a label of the details grid. */
  function detail(label: string): string {
    const term = queryAll(fixture, '[data-details] dt').find(element => (element.textContent ?? '').trim() === label);
    return (term?.nextElementSibling?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function noteRows(): HTMLElement[] {
    return queryAll(fixture, '[data-notes] li');
  }

  function dialogText(): string {
    return textOf(fixture, 'app-comment-dialog [role="dialog"]');
  }

  function typeInDialog(text: string): void {
    setValue(fixture, 'app-comment-dialog textarea', text);
  }

  function confirmDialog(): void {
    click(fixture, '[data-dialog-confirm]');
  }

  function dialogErrors(): string {
    return textOf(fixture, 'app-comment-dialog [data-field-errors]');
  }

  /** The activity as the server returns it after an action. */
  function after(overrides: Partial<Activity>): Activity {
    return buildActivity({ rowVersion: NEW_ROW_VERSION, ...overrides });
  }

  beforeEach(() => {
    activities = createActivityServiceSpy();
    notifications = createNotificationServiceSpy();
    params$ = new BehaviorSubject<ParamMap>(convertToParamMap({}));

    TestBed.configureTestingModule({
      declarations: [ActivityDetailComponent],
      imports: [SharedModule, RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params$.asObservable() } },
        { provide: ActivityService, useValue: activities },
        { provide: LookupService, useValue: createLookupServiceSpy() },
        { provide: NotificationService, useValue: notifications }
      ]
    });
  });

  describe('header and details', () => {
    it('loads the activity of the route', () => {
      create();

      expect(activities.getById).toHaveBeenCalledOnceWith(5);
      expect(textOf(fixture, '[data-activity-number]')).toBe('ACT-000005');
    });

    it('shows the status and the priority as coloured badges with the names of the lookups', () => {
      create(buildActivity({ status: ActivityStatus.InProgress, priority: ActivityPriority.Urgent }));

      const badges = queryAll(fixture, '.page-header app-status-badge .badge');
      expect(badges.map(badge => badge.textContent?.trim())).toEqual(['In Progress', 'Urgent']);
      expect(badges[0].classList).toContain('text-bg-info');
      expect(badges[1].classList).toContain('text-bg-danger');
    });

    it('flags an overdue activity in the header and next to the due date', () => {
      create(buildActivity({ isOverdue: true }));

      expect(textOf(fixture, '.page-header .badge.text-bg-danger')).toBe('Overdue');
      expect(query(fixture, '[data-details] .badge.text-bg-danger')).not.toBeNull();
    });

    it('does not flag an activity that is on time', () => {
      create();

      expect(query(fixture, '.badge.text-bg-danger')).toBeNull();
    });

    it('shows the details with the date-only fields as calendar dates and the timestamps in local time', () => {
      create(
        buildActivity({
          takebackId: 7,
          takebackNumber: 'TB-000007',
          modifiedByName: 'Sam Supervisor',
          modifiedDate: TEST_TIMESTAMP
        })
      );

      expect(detail('Type')).toBe('Phone Call');
      expect(detail('Member')).toBe('Maria Lopez (M-0011)');
      expect(detail('Takeback')).toBe('TB-000007');
      expect(detail('Assigned to')).toBe('Ana Analyst');
      expect(detail('Due date')).toBe('3/14/2025');
      const local = localTime(TEST_TIMESTAMP);
      expect(detail('Created')).toBe(`Ana Analyst on ${local}`);
      expect(detail('Last modified')).toBe(`Sam Supervisor on ${local}`);
    });

    it('does not shift a due date over midnight, whatever the time zone', () => {
      create(buildActivity({ dueDate: '2025-12-31T00:00:00' }));

      expect(detail('Due date')).toBe('12/31/2025');
    });

    it('links the member to the activities of that member and the takeback to its page', () => {
      create(buildActivity({ takebackId: 7, takebackNumber: 'TB-000007' }));

      const member = query<HTMLAnchorElement>(fixture, '[data-details] a[title]');
      expect(member?.getAttribute('href')).toBe('/activities?searchText=M-0011&openOnly=false');
      const links = queryAll<HTMLAnchorElement>(fixture, '[data-details] a').map(link => link.getAttribute('href'));
      expect(links).toContain('/takebacks/7');
    });

    it('shows dashes for a missing member, takeback and due date and Unassigned without an assignee', () => {
      create(
        buildActivity({
          memberId: null,
          memberNumber: null,
          memberName: null,
          assignedToUserId: null,
          assignedToName: null,
          dueDate: null
        })
      );

      expect(detail('Member')).toBe('—');
      expect(detail('Takeback')).toBe('—');
      expect(detail('Assigned to')).toBe('Unassigned');
      expect(detail('Due date')).toBe('—');
    });

    it('shows the completion and the outcome only for a completed activity', () => {
      create();
      expect(detail('Completed')).toBe('');
      expect(detail('Outcome')).toBe('');

      create(
        buildActivity({
          status: ActivityStatus.Completed,
          completedDate: TEST_TIMESTAMP,
          outcome: 'Reached the member.\nCoverage confirmed.',
          availableActions: ['Reopen']
        })
      );

      expect(detail('Completed')).toBe(localTime(TEST_TIMESTAMP));
      expect(query(fixture, '[data-outcome]')?.textContent).toContain('Coverage confirmed.');
    });

    it('shows the description when there is one', () => {
      create();
      expect(textOf(fixture, '[data-description]')).toBe('Ask about the second policy.');

      create(buildActivity({ description: null }));
      expect(query(fixture, '[data-description]')).toBeNull();
    });

    it('has a breadcrumb back to the list', () => {
      create();

      expect(query(fixture, 'nav[aria-label="Breadcrumb"] a')?.getAttribute('href')).toBe('/activities');
    });
  });

  describe('loading', () => {
    it('shows a spinner until the activity has arrived', () => {
      const pending = new Subject<Activity>();
      activities.getById.and.returnValue(pending);
      params$.next(convertToParamMap({ id: '5' }));
      fixture = TestBed.createComponent(ActivityDetailComponent);
      fixture.detectChanges();
      expect(query(fixture, 'app-loading-spinner')).not.toBeNull();
      expect(query(fixture, '[data-activity-number]')).toBeNull();

      pending.next(buildActivity());
      fixture.detectChanges();

      expect(query(fixture, 'app-loading-spinner')).toBeNull();
      expect(textOf(fixture, '[data-activity-number]')).toBe('ACT-000005');
    });

    it('reports an activity that does not exist', () => {
      activities.getById.and.returnValue(throwError(() => apiError('NOT_FOUND', 'Activity 99 was not found.')));
      params$.next(convertToParamMap({ id: '99' }));
      fixture = TestBed.createComponent(ActivityDetailComponent);
      fixture.detectChanges();

      expect(textOf(fixture, '[data-load-error]')).toContain('Activity 99 was not found.');
      expect(query(fixture, '[data-load-error] a')?.getAttribute('href')).toBe('/activities');
      expect(query(fixture, '[data-activity-number]')).toBeNull();
    });

    it('does not ask the API for an id that is not a number', () => {
      params$.next(convertToParamMap({ id: '5; drop' }));
      fixture = TestBed.createComponent(ActivityDetailComponent);
      fixture.detectChanges();

      expect(activities.getById).not.toHaveBeenCalled();
      expect(textOf(fixture, '[data-load-error]')).toContain('Activity not found.');
    });

    it('loads the other activity when the id of the route changes', () => {
      create();
      activities.getById.and.returnValue(of(buildActivity({ activityId: 6, activityNumber: 'ACT-000006' })));

      params$.next(convertToParamMap({ id: '6' }));
      fixture.detectChanges();

      expect(activities.getById).toHaveBeenCalledWith(6);
      expect(textOf(fixture, '[data-activity-number]')).toBe('ACT-000006');
    });
  });

  describe('actions of the server', () => {
    it('offers Edit, Complete and Cancel when the server allows them', () => {
      create(buildActivity({ availableActions: ['Edit', 'Complete', 'Cancel', 'AddNote'] }));

      expect(actionButtons()).toEqual(['Edit', 'Complete', 'Cancel']);
      expect(query(fixture, '[data-action="Edit"]')?.getAttribute('href')).toBe('/activities/5/edit');
    });

    it('offers only Reopen for a closed activity', () => {
      create(buildActivity({ status: ActivityStatus.Cancelled, availableActions: ['Reopen'] }));

      expect(actionButtons()).toEqual(['Reopen']);
    });

    it('offers nothing when the server allows nothing, whatever the status says', () => {
      create(buildActivity({ status: ActivityStatus.Open, availableActions: [] }));

      expect(actionButtons()).toEqual([]);
      expect(query(fixture, '[data-note-form]')).toBeNull();
    });

    it('shows a button for an action exactly when the server lists it', () => {
      create(buildActivity({ status: ActivityStatus.Open, availableActions: ['Complete'] }));

      expect(actionButtons()).toEqual(['Complete']);
    });

    it('labels the buttons for people and keeps the technical action in data-action', () => {
      create(buildActivity({ availableActions: ['Edit', 'Complete', 'Cancel'] }));

      const labels = queryAll(fixture, '[data-actions] [data-action]').map(element => (element.textContent ?? '').trim());
      expect(labels).toEqual(['Edit', 'Complete', 'Cancel activity']);
    });
  });

  describe('read-only banner', () => {
    it('is shown for a completed activity with the hint to reopen it', () => {
      create(buildActivity({ status: ActivityStatus.Completed, availableActions: ['Reopen'] }));

      expect(textOf(fixture, '[data-read-only-banner]')).toBe('This activity is completed and read-only. Reopen it to continue working on it.');
    });

    it('is shown for a cancelled activity without the hint when it cannot be reopened', () => {
      create(buildActivity({ status: ActivityStatus.Cancelled, availableActions: [] }));

      expect(textOf(fixture, '[data-read-only-banner]')).toBe('This activity is cancelled and read-only.');
    });

    it('is not shown for an activity that can be worked on', () => {
      create(buildActivity({ status: ActivityStatus.InProgress }));

      expect(query(fixture, '[data-read-only-banner]')).toBeNull();
    });
  });

  describe('Complete', () => {
    beforeEach(() => create());

    it('opens a dialog that asks for the outcome', () => {
      click(fixture, '[data-action="Complete"]');

      expect(query(fixture, '[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
      expect(dialogText()).toContain('Complete activity');
      expect(dialogText()).toContain('Outcome *');
    });

    it('does not complete without an outcome and says so', () => {
      click(fixture, '[data-action="Complete"]');

      confirmDialog();

      expect(activities.complete).not.toHaveBeenCalled();
      expect(dialogErrors()).toBe('Outcome is required.');
      expect(query(fixture, 'app-comment-dialog')).not.toBeNull();
    });

    it('does not accept an outcome of blanks', () => {
      click(fixture, '[data-action="Complete"]');
      typeInDialog('     ');

      confirmDialog();

      expect(activities.complete).not.toHaveBeenCalled();
      expect(dialogErrors()).toBe('Outcome is required.');
    });

    it('limits the outcome to 1000 characters', () => {
      click(fixture, '[data-action="Complete"]');

      typeInDialog('x'.repeat(1001));
      confirmDialog();

      expect(activities.complete).not.toHaveBeenCalled();
      expect(dialogErrors()).toBe('Outcome must be at most 1000 characters.');
    });

    it('sends the outcome with the activity id and the rowVersion, then shows the returned activity', () => {
      activities.complete.and.returnValue(
        of(after({ status: ActivityStatus.Completed, outcome: 'Reached the member.', completedDate: TEST_TIMESTAMP, availableActions: ['Reopen'] }))
      );
      click(fixture, '[data-action="Complete"]');

      typeInDialog('  Reached the member.  ');
      confirmDialog();

      expect(activities.complete).toHaveBeenCalledOnceWith({ activityId: 5, comment: 'Reached the member.', rowVersion: TEST_ROW_VERSION });
      expect(query(fixture, 'app-comment-dialog')).toBeNull();
      expect(notifications.success).toHaveBeenCalledWith('Activity ACT-000005 was completed.');
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Completed');
      expect(actionButtons()).toEqual(['Reopen']);
      expect(textOf(fixture, '[data-outcome]')).toBe('Reached the member.');
      expect(query(fixture, '[data-read-only-banner]')).not.toBeNull();
      expect(component.activity?.rowVersion).toBe(NEW_ROW_VERSION);
    });

    it('closes without a call when the user changes their mind', () => {
      click(fixture, '[data-action="Complete"]');

      click(fixture, '[data-dialog-dismiss]');

      expect(query(fixture, 'app-comment-dialog')).toBeNull();
      expect(activities.complete).not.toHaveBeenCalled();
    });

    it('closes with the Escape key', () => {
      click(fixture, '[data-action="Complete"]');

      keydown(document.body, 'Escape');
      fixture.detectChanges();

      expect(query(fixture, 'app-comment-dialog')).toBeNull();
    });

    it('blocks a second request while the first is running', () => {
      const pending = new Subject<Activity>();
      activities.complete.and.returnValue(pending);
      click(fixture, '[data-action="Complete"]');
      typeInDialog('Done.');

      confirmDialog();
      confirmDialog();
      keydown(document.body, 'Escape');
      fixture.detectChanges();

      expect(activities.complete).toHaveBeenCalledTimes(1);
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeTrue();
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-dismiss]')?.disabled).toBeTrue();
      expect(query(fixture, 'app-comment-dialog')).not.toBeNull();
    });

    it('keeps the dialog open and shows the message of a failed request', () => {
      activities.complete.and.returnValue(throwError(() => apiError('BUSINESS_RULE', 'The activity is already completed.')));
      click(fixture, '[data-action="Complete"]');
      typeInDialog('Done.');

      confirmDialog();

      expect(textOf(fixture, 'app-comment-dialog [data-form-alert]')).toContain('The activity is already completed.');
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeFalse();
      expect(notifications.success).not.toHaveBeenCalled();
    });

    it('puts a validation message of the server on the comment box', () => {
      activities.complete.and.returnValue(
        throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: 'comment', message: 'The outcome is too vague.' }]))
      );
      click(fixture, '[data-action="Complete"]');
      typeInDialog('Done.');

      confirmDialog();

      expect(dialogErrors()).toBe('The outcome is too vague.');
    });

    it('replaces the dialog with the concurrency panel when somebody else changed the activity', () => {
      activities.complete.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed by another user.')));
      click(fixture, '[data-action="Complete"]');
      typeInDialog('Done.');

      confirmDialog();

      expect(query(fixture, 'app-comment-dialog')).toBeNull();
      expect(textOf(fixture, '[data-concurrency-panel]')).toContain('This record was changed by another user');
      expect(notifications.error).not.toHaveBeenCalled();
    });

    it('reloads the activity from the concurrency panel and acts on the new version afterwards', () => {
      activities.complete.and.returnValues(
        throwError(() => apiError('CONCURRENCY', 'Changed by another user.')),
        of(after({ status: ActivityStatus.Completed, availableActions: ['Reopen'] }))
      );
      click(fixture, '[data-action="Complete"]');
      typeInDialog('Done.');
      confirmDialog();
      activities.getById.and.returnValue(of(after({ subject: 'Changed by a colleague', status: ActivityStatus.InProgress })));

      click(fixture, '[data-concurrency-panel] button');

      expect(activities.getById).toHaveBeenCalledTimes(2);
      expect(query(fixture, '[data-concurrency-panel]')).toBeNull();
      expect(textOf(fixture, '#details-heading')).toBe('Changed by a colleague');

      click(fixture, '[data-action="Complete"]');
      typeInDialog('Done after the reload.');
      confirmDialog();
      expect(activities.complete.calls.mostRecent().args[0]).toEqual({ activityId: 5, comment: 'Done after the reload.', rowVersion: NEW_ROW_VERSION });
    });

    it('reports a failed reload and keeps the panel', () => {
      activities.complete.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed by another user.')));
      click(fixture, '[data-action="Complete"]');
      typeInDialog('Done.');
      confirmDialog();
      activities.getById.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The activity could not be loaded.')));

      click(fixture, '[data-concurrency-panel] button');

      expect(notifications.error).toHaveBeenCalledWith('The activity could not be loaded.');
      expect(query(fixture, '[data-concurrency-panel]')).not.toBeNull();
    });
  });

  describe('Cancel', () => {
    beforeEach(() => create());

    it('asks for a reason and does not cancel without one', () => {
      click(fixture, '[data-action="Cancel"]');
      expect(dialogText()).toContain('Reason *');

      confirmDialog();

      expect(activities.cancel).not.toHaveBeenCalled();
      expect(dialogErrors()).toBe('Reason is required.');
    });

    it('sends the reason and shows the cancelled activity', () => {
      activities.cancel.and.returnValue(of(after({ status: ActivityStatus.Cancelled, availableActions: ['Reopen'] })));
      click(fixture, '[data-action="Cancel"]');

      typeInDialog('Duplicate of ACT-000004.');
      confirmDialog();

      expect(activities.cancel).toHaveBeenCalledOnceWith({ activityId: 5, comment: 'Duplicate of ACT-000004.', rowVersion: TEST_ROW_VERSION });
      expect(notifications.success).toHaveBeenCalledWith('Activity ACT-000005 was cancelled.');
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Cancelled');
    });

    it('lets the user keep the activity', () => {
      click(fixture, '[data-action="Cancel"]');
      expect(textOf(fixture, '[data-dialog-dismiss]')).toBe('Keep activity');

      click(fixture, '[data-dialog-dismiss]');

      expect(activities.cancel).not.toHaveBeenCalled();
      expect(query(fixture, 'app-comment-dialog')).toBeNull();
    });
  });

  describe('Reopen', () => {
    beforeEach(() => create(buildActivity({ status: ActivityStatus.Completed, availableActions: ['Reopen'], outcome: 'Done.' })));

    it('marks the comment as optional', () => {
      click(fixture, '[data-action="Reopen"]');

      expect(dialogText()).toContain('Comment (optional)');
    });

    it('reopens without a comment', () => {
      activities.reopen.and.returnValue(of(after({ status: ActivityStatus.Open, availableActions: ['Edit', 'Complete', 'Cancel', 'AddNote'] })));
      click(fixture, '[data-action="Reopen"]');

      confirmDialog();

      expect(activities.reopen).toHaveBeenCalledOnceWith({ activityId: 5, comment: null, rowVersion: TEST_ROW_VERSION });
      expect(notifications.success).toHaveBeenCalledWith('Activity ACT-000005 was reopened.');
      expect(query(fixture, '[data-read-only-banner]')).toBeNull();
      expect(actionButtons()).toEqual(['Edit', 'Complete', 'Cancel']);
    });

    it('sends the comment when there is one', () => {
      activities.reopen.and.returnValue(of(after({ status: ActivityStatus.Open })));
      click(fixture, '[data-action="Reopen"]');

      typeInDialog('The member called back.');
      confirmDialog();

      expect(activities.reopen.calls.mostRecent().args[0].comment).toBe('The member called back.');
    });
  });

  describe('notes', () => {
    it('lists the newest note first and sets system notes apart', () => {
      create(
        buildActivity({
          notes: [
            buildNote({ noteId: 1, noteText: 'First call.', createdDate: '2025-03-14T10:00:00Z' }),
            buildNote({ noteId: 2, noteText: 'Second call.', createdDate: '2025-03-15T10:00:00Z' }),
            buildNote({ noteId: 3, noteText: 'Status changed to In Progress.', isSystem: true, createdByName: 'System', createdDate: '2025-03-16T10:00:00Z' })
          ]
        })
      );

      const rows = noteRows();
      expect(rows.map(row => row.querySelector('.text-pre-wrap')?.textContent)).toEqual([
        'Status changed to In Progress.',
        'Second call.',
        'First call.'
      ]);
      expect(rows[0].hasAttribute('data-note-system')).toBeTrue();
      expect(rows[0].classList).toContain('timeline-system');
      expect(rows[0].querySelector('.bi-gear')).not.toBeNull();
      expect(rows[0].textContent).toContain('System note.');
      expect(rows[1].hasAttribute('data-note-system')).toBeFalse();
      expect(rows[1].querySelector('.bi-chat-left-text')).not.toBeNull();
      expect(rows[1].querySelector('strong')?.textContent).toBe('Ana Analyst');
    });

    it('orders notes of the same moment by their number, newest first', () => {
      create(
        buildActivity({
          notes: [
            buildNote({ noteId: 1, noteText: 'Older.' }),
            buildNote({ noteId: 2, noteText: 'Newer.' })
          ]
        })
      );

      expect(noteRows().map(row => row.querySelector('.text-pre-wrap')?.textContent)).toEqual(['Newer.', 'Older.']);
    });

    it('says so when there are no notes yet', () => {
      create();

      expect(textOf(fixture, '[data-empty="notes"]')).toBe('There are no notes yet.');
      expect(noteRows().length).toBe(0);
    });

    it('shows the add-note form only when the server allows AddNote', () => {
      create(buildActivity({ availableActions: ['Edit', 'AddNote'] }));
      expect(query(fixture, '[data-note-form]')).not.toBeNull();

      create(buildActivity({ availableActions: ['Edit'] }));
      expect(query(fixture, '[data-note-form]')).toBeNull();
    });

    it('does not add an empty note', () => {
      create();

      click(fixture, '[data-action="add-note"]');

      expect(activities.addNote).not.toHaveBeenCalled();
      expect(textOf(fixture, '#note-text-errors')).toBe('Note is required.');
      expect(document.activeElement?.id).toBe('note-text');
    });

    it('limits a note to 2000 characters and counts the remaining ones', () => {
      create();

      setValue(fixture, '#note-text', 'x'.repeat(1990));
      expect(textOf(fixture, '[data-note-form] .form-text')).toBe('10 characters remaining');
      setValue(fixture, '#note-text', 'x'.repeat(2001));
      click(fixture, '[data-action="add-note"]');

      expect(activities.addNote).not.toHaveBeenCalled();
      expect(textOf(fixture, '#note-text-errors')).toBe('Note must be at most 2000 characters.');
    });

    it('adds the note, shows the returned timeline and clears the box', () => {
      activities.addNote.and.returnValue(of(after({ notes: [buildNote({ noteId: 8, noteText: 'Left a voicemail.' })] })));
      create();

      setValue(fixture, '#note-text', '  Left a voicemail.  ');
      click(fixture, '[data-action="add-note"]');

      expect(activities.addNote).toHaveBeenCalledOnceWith({ activityId: 5, noteText: 'Left a voicemail.' });
      expect(notifications.success).toHaveBeenCalledWith('Note added.');
      expect(value('#note-text')).toBe('');
      expect(noteRows().map(row => row.querySelector('.text-pre-wrap')?.textContent)).toEqual(['Left a voicemail.']);
      expect(component.activity?.rowVersion).toBe(NEW_ROW_VERSION);
    });

    it('adds a note through the submit event as well (Enter in the form)', () => {
      activities.addNote.and.returnValue(of(after({})));
      create();

      setValue(fixture, '#note-text', 'Called.');
      submit(fixture, '[data-note-form]');

      expect(activities.addNote).toHaveBeenCalledTimes(1);
    });

    it('disables the button while the note is being saved so it cannot be added twice', () => {
      const pending = new Subject<Activity>();
      activities.addNote.and.returnValue(pending);
      create();
      setValue(fixture, '#note-text', 'Called.');

      click(fixture, '[data-action="add-note"]');
      submit(fixture, '[data-note-form]');

      expect(activities.addNote).toHaveBeenCalledTimes(1);
      expect(query<HTMLButtonElement>(fixture, '[data-action="add-note"]')?.disabled).toBeTrue();

      pending.next(after({}));
      pending.complete();
      fixture.detectChanges();
      expect(query<HTMLButtonElement>(fixture, '[data-action="add-note"]')?.disabled).toBeFalse();
    });

    it('keeps the text and reports the problem when the note cannot be saved', () => {
      activities.addNote.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The note could not be saved.')));
      create();
      setValue(fixture, '#note-text', 'Called.');

      click(fixture, '[data-action="add-note"]');

      expect(notifications.error).toHaveBeenCalledWith('The note could not be saved.');
      expect(value('#note-text')).toBe('Called.');
    });

    it('puts a validation message of the server on the note box', () => {
      activities.addNote.and.returnValue(
        throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: 'noteText', message: 'Notes cannot contain links.' }]))
      );
      create();
      setValue(fixture, '#note-text', 'See http://example.com');

      click(fixture, '[data-action="add-note"]');

      expect(textOf(fixture, '#note-text-errors')).toBe('Notes cannot contain links.');
    });

    it('shows the concurrency panel when the activity changed while the note was written', () => {
      activities.addNote.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed by another user.')));
      create();
      setValue(fixture, '#note-text', 'Called.');

      click(fixture, '[data-action="add-note"]');

      expect(query(fixture, '[data-concurrency-panel]')).not.toBeNull();
      expect(notifications.error).not.toHaveBeenCalled();
    });
  });
});
