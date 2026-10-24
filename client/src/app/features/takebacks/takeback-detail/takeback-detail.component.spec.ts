import { formatDate } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { LookupService } from '../../../core/services/lookup.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TakebackService } from '../../../core/services/takeback.service';
import { ActivityPriority, ActivityStatus, RecoveryMethod, TakebackAction, TakebackReason, TakebackStatus } from '../../../models/enums';
import { Takeback, TakebackActionRequest } from '../../../models/models';
import { SharedModule } from '../../../shared/shared.module';
import { todayIso } from '../../../shared/utils/date-utils';
import {
  TEST_ROW_VERSION,
  TEST_TIMESTAMP,
  buildActivityListItem,
  buildHistoryEntry,
  buildRecovery,
  buildTakeback
} from '../../../testing/test-data';
import { apiError, createLookupServiceSpy, createNotificationServiceSpy, createTakebackServiceSpy } from '../../../testing/test-doubles';
import { click, keydown, query, queryAll, selectOption, setChecked, setValue, textOf } from '../../../testing/test-helpers';
import { RecordRecoveryDialogComponent } from '../record-recovery-dialog/record-recovery-dialog.component';
import { ResolveDisputeDialogComponent } from '../resolve-dispute-dialog/resolve-dispute-dialog.component';
import { TakebackDetailComponent } from './takeback-detail.component';

const NEW_ROW_VERSION = 'AAAAAAAAB9I=';

/** A takeback the provider was notified about: recoveries, a due date and the actions that follow. */
function noticeSent(overrides: Partial<Takeback> = {}): Takeback {
  return buildTakeback({
    status: TakebackStatus.NoticeSent,
    noticeDate: '2025-03-01T00:00:00',
    dueDate: '2025-03-31T00:00:00',
    takebackAmount: 1000,
    recoveredAmount: 250,
    outstandingAmount: 750,
    recoveries: [buildRecovery()],
    availableActions: ['RecordRecovery', 'Dispute', 'WriteOff'],
    ...overrides
  });
}

/** The same calendar day the "send notice" dialog promises, written the way the calendarDate pipe writes it. */
function todayShort(): string {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

function texts(root: ParentNode, selector: string): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).map(element => (element.textContent ?? '').replace(/\s+/g, ' ').trim());
}

interface CommentScenario {
  action: 'Reject' | 'Dispute' | 'WriteOff' | 'Cancel';
  call: 'reject' | 'dispute' | 'writeOff' | 'cancel';
  title: string;
  label: string;
  confirm: string;
  dismiss: string;
  toast: string;
  from: TakebackStatus;
  to: TakebackStatus;
  toName: string;
}

const COMMENT_SCENARIOS: CommentScenario[] = [
  {
    action: 'Reject',
    call: 'reject',
    title: 'Reject takeback',
    label: 'Reason for the rejection',
    confirm: 'Reject takeback',
    dismiss: 'Cancel',
    toast: 'Takeback TB-000007 was rejected.',
    from: TakebackStatus.PendingApproval,
    to: TakebackStatus.Rejected,
    toName: 'Rejected'
  },
  {
    action: 'Dispute',
    call: 'dispute',
    title: 'Record a dispute',
    label: 'Dispute details',
    confirm: 'Record dispute',
    dismiss: 'Cancel',
    toast: 'Takeback TB-000007 is now disputed.',
    from: TakebackStatus.NoticeSent,
    to: TakebackStatus.Disputed,
    toName: 'Disputed'
  },
  {
    action: 'WriteOff',
    call: 'writeOff',
    title: 'Write off takeback',
    label: 'Reason for the write-off',
    confirm: 'Write off',
    dismiss: 'Cancel',
    toast: 'Takeback TB-000007 was written off.',
    from: TakebackStatus.NoticeSent,
    to: TakebackStatus.WrittenOff,
    toName: 'Written Off'
  },
  {
    action: 'Cancel',
    call: 'cancel',
    title: 'Cancel takeback',
    label: 'Reason for the cancellation',
    confirm: 'Cancel takeback',
    dismiss: 'Keep takeback',
    toast: 'Takeback TB-000007 was cancelled.',
    from: TakebackStatus.Draft,
    to: TakebackStatus.Cancelled,
    toName: 'Cancelled'
  }
];

describe('TakebackDetailComponent', () => {
  let takebacks: jasmine.SpyObj<TakebackService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let params$: BehaviorSubject<ParamMap>;
  let fixture: ComponentFixture<TakebackDetailComponent>;
  let component: TakebackDetailComponent;

  function create(takeback: Takeback = buildTakeback()): void {
    fixture?.destroy();
    takebacks.getById.and.returnValue(of(takeback));
    params$.next(convertToParamMap({ id: String(takeback.takebackId) }));
    fixture = TestBed.createComponent(TakebackDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** A timestamp as the date pipe shows it in the local time zone (white space collapsed like the helpers do). */
  function localTime(timestamp: string): string {
    return formatDate(timestamp, 'medium', 'en-US').replace(/\s+/g, ' ');
  }

  function actionButtons(): string[] {
    return queryAll(fixture, '[data-actions] [data-action]').map(element => element.getAttribute('data-action') ?? '');
  }

  /** Text of the value that belongs to a label of the details grid. */
  function detail(label: string): string {
    const term = queryAll(fixture, '[data-details] dt').find(element => (element.textContent ?? '').trim() === label);
    return (term?.nextElementSibling?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function cells(row: HTMLElement): string[] {
    return texts(row, 'td');
  }

  function dialogText(): string {
    return textOf(fixture, '[role="dialog"]');
  }

  function openDialog(action: string): void {
    click(fixture, `[data-actions] [data-action="${action}"]`);
  }

  function confirmDialog(): void {
    click(fixture, '[data-dialog-confirm]');
  }

  function dismissDialog(): void {
    click(fixture, '[data-dialog-dismiss]');
  }

  function typeComment(text: string): void {
    setValue(fixture, '[role="dialog"] textarea', text);
  }

  function isDialogOpen(): boolean {
    return query(fixture, '[role="dialog"]') !== null;
  }

  /** The takeback as the server returns it after an action. */
  function after(overrides: Partial<Takeback>): Takeback {
    return buildTakeback({ rowVersion: NEW_ROW_VERSION, ...overrides });
  }

  beforeEach(() => {
    takebacks = createTakebackServiceSpy();
    notifications = createNotificationServiceSpy();
    params$ = new BehaviorSubject<ParamMap>(convertToParamMap({}));

    TestBed.configureTestingModule({
      declarations: [TakebackDetailComponent, RecordRecoveryDialogComponent, ResolveDisputeDialogComponent],
      imports: [SharedModule, RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params$.asObservable() } },
        { provide: TakebackService, useValue: takebacks },
        { provide: LookupService, useValue: createLookupServiceSpy() },
        { provide: NotificationService, useValue: notifications }
      ]
    });
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('header and amounts', () => {
    it('loads the takeback of the route and shows its number and claim number', () => {
      create();

      expect(takebacks.getById).toHaveBeenCalledOnceWith(7);
      expect(textOf(fixture, '[data-takeback-number]')).toBe('TB-000007');
      expect(textOf(fixture, '[data-claim-number]')).toBe('CLM-2025-0042');
    });

    it('shows the status as a coloured badge with the name of the lookup', () => {
      create(buildTakeback({ status: TakebackStatus.PendingApproval, availableActions: [] }));

      const badge = query(fixture, '.page-header app-status-badge .badge');
      expect(badge?.textContent?.trim()).toBe('Pending Approval');
      expect(badge?.classList).toContain('text-bg-warning');
    });

    it('flags an overdue takeback in the header and next to the due date', () => {
      create(noticeSent({ isOverdue: true }));

      expect(textOf(fixture, '.page-header .badge.text-bg-danger')).toBe('Overdue');
      expect(query(fixture, '[data-due-date] .badge.text-bg-danger')).not.toBeNull();
    });

    it('does not flag a takeback that is on time', () => {
      create(noticeSent());

      expect(query(fixture, '.badge.text-bg-danger')).toBeNull();
    });

    it('shows the amounts as US dollars', () => {
      create(noticeSent());

      expect(textOf(fixture, '[data-amount="takeback"]')).toBe('$1,000.00');
      expect(textOf(fixture, '[data-amount="recovered"]')).toBe('$250.00');
      expect(textOf(fixture, '[data-amount="outstanding"]')).toBe('$750.00');
    });

    it('marks the outstanding amount in red only while something is outstanding', () => {
      create(noticeSent());
      expect(query(fixture, '[data-amount="outstanding"]')?.classList).toContain('text-danger');

      create(buildTakeback({ status: TakebackStatus.Recovered, recoveredAmount: 1000, outstandingAmount: 0, availableActions: [] }));
      expect(query(fixture, '[data-amount="outstanding"]')?.classList).not.toContain('text-danger');
    });

    it('calls the balance "Outstanding" while the takeback is open', () => {
      create(noticeSent());

      expect(textOf(fixture, '[data-amount-label="outstanding"]')).toBe('Outstanding');
    });

    it('calls the balance of a written-off takeback "Written off" and does not mark it in red', () => {
      create(buildTakeback({ status: TakebackStatus.WrittenOff, recoveredAmount: 250, outstandingAmount: 750, availableActions: [] }));

      expect(textOf(fixture, '[data-amount-label="outstanding"]')).toBe('Written off');
      expect(textOf(fixture, '[data-amount="outstanding"]')).toBe('$750.00');
      expect(query(fixture, '[data-amount="outstanding"]')?.classList).not.toContain('text-danger');
    });

    it('calls the amount of a cancelled takeback "Not pursued" and does not mark it in red', () => {
      create(buildTakeback({ status: TakebackStatus.Cancelled, recoveredAmount: 0, outstandingAmount: 1000, availableActions: [] }));

      expect(textOf(fixture, '[data-amount-label="outstanding"]')).toBe('Not pursued');
      expect(query(fixture, '[data-amount="outstanding"]')?.classList).not.toContain('text-danger');
    });

    it('shows the share of the takeback amount that is recovered in the progress bar', () => {
      create(noticeSent());

      const progress = query(fixture, '[data-progress]');
      expect(progress?.getAttribute('role')).toBe('progressbar');
      expect(progress?.getAttribute('aria-valuenow')).toBe('25');
      expect(textOf(fixture, '[data-progress] .progress-bar')).toBe('25% recovered');
      expect(query<HTMLElement>(fixture, '[data-progress] .progress-bar')?.style.width).toBe('25%');
    });

    it('shows a full progress bar for a recovered takeback and an empty one without recoveries', () => {
      create(buildTakeback({ recoveredAmount: 1000, outstandingAmount: 0, availableActions: [] }));
      expect(query(fixture, '[data-progress]')?.getAttribute('aria-valuenow')).toBe('100');

      create(buildTakeback({ recoveredAmount: 0 }));
      expect(query(fixture, '[data-progress]')?.getAttribute('aria-valuenow')).toBe('0');
    });

    it('does not divide by zero for a takeback of no money', () => {
      create(buildTakeback({ takebackAmount: 0, recoveredAmount: 0, outstandingAmount: 0 }));

      expect(query(fixture, '[data-progress]')?.getAttribute('aria-valuenow')).toBe('0');
    });

    it('has a breadcrumb back to the list', () => {
      create();

      expect(query(fixture, 'nav[aria-label="Breadcrumb"] a')?.getAttribute('href')).toBe('/takebacks');
    });
  });

  describe('details', () => {
    it('shows member, provider, reason, date of service and the original payment', () => {
      create();

      expect(detail('Member')).toBe('Maria Lopez (M-0011)');
      expect(detail('Provider')).toBe('Riverside Clinic (P-0021)');
      expect(detail('Reason')).toBe('Duplicate Payment');
      expect(detail('Date of service')).toBe('1/15/2025');
      expect(detail('Original paid amount')).toBe('$1,500.00');
    });

    it('shows the people and times of the record: date-only fields as calendar dates, timestamps in local time', () => {
      create(
        noticeSent({
          approvedByUserId: 2,
          approvedByName: 'Sam Supervisor',
          approvedDate: TEST_TIMESTAMP,
          modifiedByUserId: 2,
          modifiedByName: 'Sam Supervisor',
          modifiedDate: TEST_TIMESTAMP
        })
      );

      const local = localTime(TEST_TIMESTAMP);
      expect(detail('Notice date')).toBe('3/1/2025');
      expect(detail('Due date')).toBe('3/31/2025');
      expect(detail('Approved')).toBe(`Sam Supervisor on ${local}`);
      expect(detail('Created')).toBe(`Ana Analyst on ${local}`);
      expect(detail('Last modified')).toBe(`Sam Supervisor on ${local}`);
    });

    it('does not shift a calendar date over midnight, whatever the time zone', () => {
      create(buildTakeback({ dateOfService: '2025-12-31T00:00:00', noticeDate: '2025-01-01T00:00:00', dueDate: '2025-01-31T00:00:00' }));

      expect(detail('Date of service')).toBe('12/31/2025');
      expect(detail('Notice date')).toBe('1/1/2025');
    });

    it('leaves out what a draft does not have yet', () => {
      create();

      expect(detail('Notice date')).toBe('');
      expect(detail('Due date')).toBe('');
      expect(detail('Approved')).toBe('');
      expect(detail('Last modified')).toBe('');
      expect(detail('Other carrier')).toBe('');
      expect(query(fixture, '[data-notes]')).toBeNull();
    });

    it('shows the other carrier and policy number when there are some', () => {
      create(buildTakeback({ reason: TakebackReason.OtherInsurancePrimary, otherCarrierName: 'Acme Health', otherPolicyNumber: 'POL-9' }));

      expect(detail('Other carrier')).toBe('Acme Health');
      expect(detail('Other policy number')).toBe('POL-9');
    });

    it('shows a dash for the part of the other coverage that is missing', () => {
      create(buildTakeback({ otherCarrierName: null, otherPolicyNumber: 'POL-9' }));

      expect(detail('Other carrier')).toBe('—');
      expect(detail('Other policy number')).toBe('POL-9');
    });

    it('shows the notes with their line breaks preserved', () => {
      create(buildTakeback({ notes: 'Called the provider.\nSent the claim copy.' }));

      const notes = query(fixture, '[data-notes]');
      expect(notes?.textContent).toContain('Sent the claim copy.');
      expect(notes?.classList).toContain('text-pre-wrap');
    });
  });

  describe('loading', () => {
    it('shows a spinner until the takeback has arrived', () => {
      const pending = new Subject<Takeback>();
      takebacks.getById.and.returnValue(pending);
      params$.next(convertToParamMap({ id: '7' }));
      fixture = TestBed.createComponent(TakebackDetailComponent);
      fixture.detectChanges();
      expect(query(fixture, 'app-loading-spinner')).not.toBeNull();
      expect(query(fixture, '[data-takeback-number]')).toBeNull();

      pending.next(buildTakeback());
      fixture.detectChanges();

      expect(query(fixture, 'app-loading-spinner')).toBeNull();
      expect(textOf(fixture, '[data-takeback-number]')).toBe('TB-000007');
    });

    it('reports a takeback that does not exist and links back to the list', () => {
      takebacks.getById.and.returnValue(throwError(() => apiError('NOT_FOUND', 'Takeback 99 was not found.')));
      params$.next(convertToParamMap({ id: '99' }));
      fixture = TestBed.createComponent(TakebackDetailComponent);
      fixture.detectChanges();

      expect(textOf(fixture, '[data-load-error]')).toContain('Takeback 99 was not found.');
      expect(query(fixture, '[data-load-error] a')?.getAttribute('href')).toBe('/takebacks');
      expect(query(fixture, '[data-takeback-number]')).toBeNull();
    });

    it('does not ask the API for an id that is not a number', () => {
      params$.next(convertToParamMap({ id: '7; drop' }));
      fixture = TestBed.createComponent(TakebackDetailComponent);
      fixture.detectChanges();

      expect(takebacks.getById).not.toHaveBeenCalled();
      expect(textOf(fixture, '[data-load-error]')).toContain('Takeback not found.');
    });

    it('loads the other takeback when the id of the route changes and closes an open dialog', () => {
      create();
      openDialog('Submit');
      expect(isDialogOpen()).toBeTrue();
      takebacks.getById.and.returnValue(of(buildTakeback({ takebackId: 8, takebackNumber: 'TB-000008' })));

      params$.next(convertToParamMap({ id: '8' }));
      fixture.detectChanges();

      expect(takebacks.getById).toHaveBeenCalledWith(8);
      expect(textOf(fixture, '[data-takeback-number]')).toBe('TB-000008');
      expect(isDialogOpen()).toBeFalse();
    });

    it('stops listening to the route once it is destroyed', () => {
      create();
      fixture.destroy();
      takebacks.getById.calls.reset();

      params$.next(convertToParamMap({ id: '9' }));

      expect(takebacks.getById).not.toHaveBeenCalled();
    });
  });

  describe('actions of the server', () => {
    it('offers Edit, Submit and Cancel for a draft when the server allows them', () => {
      create(buildTakeback({ availableActions: ['Edit', 'Submit', 'Cancel'] }));

      expect(actionButtons()).toEqual(['Edit', 'Submit', 'Cancel']);
      const labels = texts(fixture.nativeElement as HTMLElement, '[data-actions] [data-action]');
      expect(labels).toEqual(['Edit', 'Submit for approval', 'Cancel takeback']);
    });

    it('opens the edit route with the Edit link', () => {
      create(buildTakeback({ availableActions: ['Edit'] }));

      const edit = query(fixture, '[data-actions] [data-action="Edit"]');
      expect(edit?.tagName).toBe('A');
      expect(edit?.getAttribute('href')).toBe('/takebacks/7/edit');
    });

    it('offers nothing when the server allows nothing, whatever the status says', () => {
      create(buildTakeback({ status: TakebackStatus.Draft, availableActions: [] }));

      expect(actionButtons()).toEqual([]);
    });

    it('offers exactly what the server lists, in a fixed order', () => {
      create(buildTakeback({ status: TakebackStatus.PendingApproval, availableActions: ['Cancel', 'Reject', 'Approve'] }));

      expect(actionButtons()).toEqual(['Approve', 'Reject', 'Cancel']);
    });

    it('can offer every action of the workflow', () => {
      create(buildTakeback({ availableActions: Object.values(TakebackAction) }));

      expect(actionButtons()).toEqual([
        'Edit',
        'Submit',
        'Approve',
        'Reject',
        'SendNotice',
        'RecordRecovery',
        'Dispute',
        'ResolveDispute',
        'WriteOff',
        'Cancel'
      ]);
    });

    it('ignores actions it has no button for', () => {
      create(buildTakeback({ availableActions: ['Archive', 'Submit'] }));

      expect(actionButtons()).toEqual(['Submit']);
    });

    it('asks the server list, not the status, whether an action exists', () => {
      create(noticeSent({ availableActions: ['Dispute'] }));

      expect(component.can(TakebackAction.Dispute)).toBeTrue();
      expect(component.can(TakebackAction.RecordRecovery)).toBeFalse();
      expect(actionButtons()).toEqual(['Dispute']);
    });

    it('always offers to add an activity to the takeback', () => {
      create(buildTakeback({ availableActions: [] }));

      const add = query(fixture, '[data-action="add-activity"]');
      expect(add?.getAttribute('href')).toBe('/activities/new?takebackId=7');
    });

    const dialogs: [string, string][] = [
      ['Submit', 'Submit for approval'],
      ['Approve', 'Approve takeback'],
      ['Reject', 'Reject takeback'],
      ['SendNotice', 'Send recovery notice'],
      ['RecordRecovery', 'Record recovery'],
      ['Dispute', 'Record a dispute'],
      ['ResolveDispute', 'Resolve dispute'],
      ['WriteOff', 'Write off takeback'],
      ['Cancel', 'Cancel takeback']
    ];
    for (const [action, title] of dialogs) {
      it(`opens the "${title}" dialog for ${action} and closes it with Escape`, () => {
        create(buildTakeback({ availableActions: [action] }));

        openDialog(action);

        expect(query(fixture, '[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
        expect(textOf(fixture, '.modal-title')).toBe(title);

        keydown(document.body, 'Escape');
        fixture.detectChanges();

        expect(isDialogOpen()).toBeFalse();
      });
    }
  });

  describe('Submit', () => {
    beforeEach(() => create(buildTakeback({ availableActions: ['Edit', 'Submit', 'Cancel'] })));

    it('asks for a confirmation and explains what happens', () => {
      openDialog('Submit');

      expect(dialogText()).toContain('The takeback is sent to a supervisor for approval.');
      expect(textOf(fixture, '[data-dialog-confirm]')).toBe('Submit for approval');
    });

    it('closes without a call when the user changes their mind', () => {
      openDialog('Submit');

      dismissDialog();

      expect(isDialogOpen()).toBeFalse();
      expect(takebacks.submit).not.toHaveBeenCalled();
    });

    it('sends the takeback id and the rowVersion and shows the returned takeback', () => {
      takebacks.submit.and.returnValue(
        of(after({ status: TakebackStatus.PendingApproval, availableActions: ['Approve', 'Reject', 'Cancel'], modifiedByName: 'Ana Analyst', modifiedDate: TEST_TIMESTAMP }))
      );
      openDialog('Submit');

      confirmDialog();

      const expected: TakebackActionRequest = { takebackId: 7, comment: null, rowVersion: TEST_ROW_VERSION };
      expect(takebacks.submit).toHaveBeenCalledOnceWith(expected);
      expect(isDialogOpen()).toBeFalse();
      expect(notifications.success).toHaveBeenCalledOnceWith('Takeback TB-000007 was submitted for approval.');
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Pending Approval');
      expect(actionButtons()).toEqual(['Approve', 'Reject', 'Cancel']);
      expect(component.takeback?.rowVersion).toBe(NEW_ROW_VERSION);
    });

    it('blocks a second request while the first is running and keeps the dialog open', () => {
      const pending = new Subject<Takeback>();
      takebacks.submit.and.returnValue(pending);
      openDialog('Submit');

      confirmDialog();
      confirmDialog();
      keydown(document.body, 'Escape');
      fixture.detectChanges();

      expect(takebacks.submit).toHaveBeenCalledTimes(1);
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeTrue();
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-dismiss]')?.disabled).toBeTrue();
      expect(isDialogOpen()).toBeTrue();

      pending.next(after({ status: TakebackStatus.PendingApproval, availableActions: ['Approve'] }));
      pending.complete();
      fixture.detectChanges();

      expect(isDialogOpen()).toBeFalse();
      expect(component.busy).toBeFalse();
    });

    it('keeps the dialog open and shows the message of a rejected request', () => {
      takebacks.submit.and.returnValue(throwError(() => apiError('BUSINESS_RULE', 'Only a draft can be submitted.')));
      openDialog('Submit');

      confirmDialog();

      expect(textOf(fixture, '[data-dialog-error]')).toBe('Only a draft can be submitted.');
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeFalse();
      expect(notifications.success).not.toHaveBeenCalled();
    });

    it('forgets the message of the last attempt when the dialog is opened again', () => {
      takebacks.submit.and.returnValue(throwError(() => apiError('BUSINESS_RULE', 'Only a draft can be submitted.')));
      openDialog('Submit');
      confirmDialog();
      dismissDialog();

      openDialog('Submit');

      expect(query(fixture, '[data-dialog-error]')).toBeNull();
    });

    it('replaces the dialog with the concurrency panel when somebody else changed the takeback', () => {
      takebacks.submit.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed by another user.')));
      openDialog('Submit');

      confirmDialog();

      expect(isDialogOpen()).toBeFalse();
      expect(textOf(fixture, '[data-concurrency-panel]')).toContain('This record was changed by another user');
      expect(notifications.error).not.toHaveBeenCalled();
      expect(notifications.success).not.toHaveBeenCalled();
    });
  });

  describe('concurrency panel', () => {
    beforeEach(() => {
      create(buildTakeback({ availableActions: ['Edit', 'Submit', 'Cancel'] }));
      takebacks.submit.and.returnValues(
        throwError(() => apiError('CONCURRENCY', 'Changed by another user.')),
        of(after({ status: TakebackStatus.PendingApproval, availableActions: [] }))
      );
      openDialog('Submit');
      confirmDialog();
    });

    it('reloads the takeback and shows the latest version', () => {
      takebacks.getById.and.returnValue(of(after({ claimNumber: 'CLM-CHANGED', availableActions: ['Edit', 'Submit', 'Cancel'] })));

      click(fixture, '[data-concurrency-panel] button');

      expect(takebacks.getById).toHaveBeenCalledTimes(2);
      expect(takebacks.getById.calls.mostRecent().args).toEqual([7]);
      expect(query(fixture, '[data-concurrency-panel]')).toBeNull();
      expect(textOf(fixture, '[data-claim-number]')).toBe('CLM-CHANGED');
    });

    it('sends the new rowVersion with the next action after the reload', () => {
      takebacks.getById.and.returnValue(of(after({ availableActions: ['Edit', 'Submit', 'Cancel'] })));
      click(fixture, '[data-concurrency-panel] button');

      openDialog('Submit');
      confirmDialog();

      expect(takebacks.submit.calls.mostRecent().args[0]).toEqual({ takebackId: 7, comment: null, rowVersion: NEW_ROW_VERSION });
      expect(notifications.success).toHaveBeenCalledWith('Takeback TB-000007 was submitted for approval.');
    });

    it('reports a failed reload and keeps the panel', () => {
      takebacks.getById.and.returnValue(throwError(() => apiError('SERVER_ERROR', 'The takeback could not be loaded.')));

      click(fixture, '[data-concurrency-panel] button');

      expect(notifications.error).toHaveBeenCalledWith('The takeback could not be loaded.');
      expect(query(fixture, '[data-concurrency-panel]')).not.toBeNull();
    });

    it('does not reload twice at the same time', () => {
      const pending = new Subject<Takeback>();
      takebacks.getById.and.returnValue(pending);

      click(fixture, '[data-concurrency-panel] button');
      component.reload();

      expect(takebacks.getById).toHaveBeenCalledTimes(2);
      expect(query<HTMLButtonElement>(fixture, '[data-concurrency-panel] button')?.disabled).toBeTrue();
    });
  });

  describe('Approve', () => {
    beforeEach(() => create(buildTakeback({ status: TakebackStatus.PendingApproval, availableActions: ['Approve', 'Reject', 'Cancel'] })));

    it('offers an optional comment', () => {
      openDialog('Approve');

      expect(dialogText()).toContain('Comment (optional)');
      expect(textOf(fixture, '[data-dialog-confirm]')).toBe('Approve');
    });

    it('approves without a comment', () => {
      takebacks.approve.and.returnValue(of(after({ status: TakebackStatus.Approved, availableActions: ['SendNotice', 'Cancel'] })));
      openDialog('Approve');

      confirmDialog();

      expect(takebacks.approve).toHaveBeenCalledOnceWith({ takebackId: 7, comment: null, rowVersion: TEST_ROW_VERSION });
      expect(notifications.success).toHaveBeenCalledWith('Takeback TB-000007 was approved.');
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Approved');
      expect(actionButtons()).toEqual(['SendNotice', 'Cancel']);
    });

    it('sends the trimmed comment when there is one', () => {
      takebacks.approve.and.returnValue(of(after({ status: TakebackStatus.Approved, availableActions: [] })));
      openDialog('Approve');

      typeComment('  Documents are complete.  ');
      confirmDialog();

      expect(takebacks.approve.calls.mostRecent().args[0].comment).toBe('Documents are complete.');
    });

    it('limits the comment to 1000 characters', () => {
      openDialog('Approve');

      typeComment('c'.repeat(1001));
      confirmDialog();

      expect(takebacks.approve).not.toHaveBeenCalled();
      expect(textOf(fixture, '[role="dialog"] [data-field-errors]')).toBe('Comment must be at most 1000 characters.');
    });
  });

  for (const scenario of COMMENT_SCENARIOS) {
    describe(`${scenario.action} (comment required)`, () => {
      beforeEach(() => create(buildTakeback({ status: scenario.from, availableActions: [scenario.action] })));

      it('asks for the comment and marks it as required', () => {
        openDialog(scenario.action);

        expect(dialogText()).toContain(`${scenario.label} *`);
        expect(textOf(fixture, '[data-dialog-confirm]')).toBe(scenario.confirm);
        expect(textOf(fixture, '[data-dialog-dismiss]')).toBe(scenario.dismiss);
      });

      it('does not act without a comment and says so', () => {
        openDialog(scenario.action);

        confirmDialog();

        expect(takebacks[scenario.call]).not.toHaveBeenCalled();
        expect(textOf(fixture, '[role="dialog"] [data-field-errors]')).toBe(`${scenario.label} is required.`);
        expect(isDialogOpen()).toBeTrue();
      });

      it('does not accept a comment of blanks', () => {
        openDialog(scenario.action);

        typeComment('     ');
        confirmDialog();

        expect(takebacks[scenario.call]).not.toHaveBeenCalled();
        expect(textOf(fixture, '[role="dialog"] [data-field-errors]')).toBe(`${scenario.label} is required.`);
      });

      it('limits the comment to 1000 characters', () => {
        openDialog(scenario.action);

        typeComment('x'.repeat(1001));
        confirmDialog();

        expect(takebacks[scenario.call]).not.toHaveBeenCalled();
        expect(textOf(fixture, '[role="dialog"] [data-field-errors]')).toBe(`${scenario.label} must be at most 1000 characters.`);
      });

      it('sends the trimmed comment with the id and the rowVersion and shows the returned takeback', () => {
        takebacks[scenario.call].and.returnValue(of(after({ status: scenario.to, availableActions: [] })));
        openDialog(scenario.action);

        typeComment('  Because of the audit.  ');
        confirmDialog();

        expect(takebacks[scenario.call]).toHaveBeenCalledOnceWith({
          takebackId: 7,
          comment: 'Because of the audit.',
          rowVersion: TEST_ROW_VERSION
        });
        expect(isDialogOpen()).toBeFalse();
        expect(notifications.success).toHaveBeenCalledOnceWith(scenario.toast);
        expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe(scenario.toName);
        expect(actionButtons()).toEqual([]);
        expect(component.takeback?.rowVersion).toBe(NEW_ROW_VERSION);
      });

      it('keeps the dialog open and shows the message of a rejected request', () => {
        takebacks[scenario.call].and.returnValue(throwError(() => apiError('BUSINESS_RULE', 'The takeback is in the wrong state.')));
        openDialog(scenario.action);
        typeComment('Because of the audit.');

        confirmDialog();

        expect(textOf(fixture, '[role="dialog"] [data-form-alert]')).toContain('The takeback is in the wrong state.');
        expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeFalse();
        expect(notifications.success).not.toHaveBeenCalled();
      });

      it('puts a validation message of the server on the comment box', () => {
        takebacks[scenario.call].and.returnValue(
          throwError(() => apiError('VALIDATION', 'Validation failed.', [{ field: 'comment', message: 'The comment is too vague.' }]))
        );
        openDialog(scenario.action);
        typeComment('Because.');

        confirmDialog();

        expect(textOf(fixture, '[role="dialog"] [data-field-errors]')).toBe('The comment is too vague.');
      });

      it('replaces the dialog with the concurrency panel when somebody else changed the takeback', () => {
        takebacks[scenario.call].and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed by another user.')));
        openDialog(scenario.action);
        typeComment('Because of the audit.');

        confirmDialog();

        expect(isDialogOpen()).toBeFalse();
        expect(query(fixture, '[data-concurrency-panel]')).not.toBeNull();
        expect(notifications.error).not.toHaveBeenCalled();
      });

      it('blocks a second request while the first is running', () => {
        const pending = new Subject<Takeback>();
        takebacks[scenario.call].and.returnValue(pending);
        openDialog(scenario.action);
        typeComment('Because of the audit.');

        confirmDialog();
        confirmDialog();

        expect(takebacks[scenario.call]).toHaveBeenCalledTimes(1);
        expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeTrue();
      });
    });
  }

  describe('SendNotice', () => {
    beforeEach(() => create(buildTakeback({ status: TakebackStatus.Approved, availableActions: ['SendNotice', 'Cancel'] })));

    const noticeResult = (dueDate: string | null): Takeback =>
      after({
        status: TakebackStatus.NoticeSent,
        noticeDate: '2025-03-15T00:00:00',
        dueDate,
        availableActions: ['RecordRecovery', 'Dispute', 'WriteOff']
      });

    it('tells that the notice date is today and that the server decides the due date', () => {
      openDialog('SendNotice');

      const hint = textOf(fixture, '[data-notice-hint]');
      expect(hint).toContain(`The notice date will be today (${todayShort()}).`);
      expect(hint).toContain('calculated by the server');
      expect(textOf(fixture, '[data-dialog-confirm]')).toBe('Send notice');
    });

    it('sends the notice without a comment and shows the dates the server decided', () => {
      takebacks.sendNotice.and.returnValue(of(noticeResult('2025-04-14T00:00:00')));
      openDialog('SendNotice');

      confirmDialog();

      expect(takebacks.sendNotice).toHaveBeenCalledOnceWith({ takebackId: 7, comment: null, rowVersion: TEST_ROW_VERSION });
      expect(isDialogOpen()).toBeFalse();
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Notice Sent');
      expect(detail('Notice date')).toBe('3/15/2025');
      expect(detail('Due date')).toBe('4/14/2025');
    });

    it('announces the due date and the response window of the result in the toast', () => {
      takebacks.sendNotice.and.returnValue(of(noticeResult('2025-04-14T00:00:00')));
      openDialog('SendNotice');

      confirmDialog();

      expect(notifications.success).toHaveBeenCalledOnceWith('Notice sent for takeback TB-000007. The response is due on 4/14/2025 (30 days).');
    });

    it('reads the response window from the server, whatever it is configured to', () => {
      takebacks.sendNotice.and.returnValue(of(noticeResult('2025-04-05T00:00:00')));
      openDialog('SendNotice');

      confirmDialog();

      expect(notifications.success).toHaveBeenCalledWith('Notice sent for takeback TB-000007. The response is due on 4/5/2025 (21 days).');
    });

    it('says "1 day" for a window of one day', () => {
      takebacks.sendNotice.and.returnValue(of(noticeResult('2025-03-16T00:00:00')));
      openDialog('SendNotice');

      confirmDialog();

      expect(notifications.success).toHaveBeenCalledWith('Notice sent for takeback TB-000007. The response is due on 3/16/2025 (1 day).');
    });

    it('does not invent a due date when the result has none', () => {
      takebacks.sendNotice.and.returnValue(of(noticeResult(null)));
      openDialog('SendNotice');

      confirmDialog();

      expect(notifications.success).toHaveBeenCalledWith('Notice sent for takeback TB-000007.');
    });

    it('keeps the dialog open and shows why the notice was not sent', () => {
      takebacks.sendNotice.and.returnValue(throwError(() => apiError('BUSINESS_RULE', 'The takeback must be approved first.')));
      openDialog('SendNotice');

      confirmDialog();

      expect(textOf(fixture, '[data-dialog-error]')).toBe('The takeback must be approved first.');
      expect(isDialogOpen()).toBeTrue();
    });
  });

  describe('RecordRecovery', () => {
    function fillRecovery(amount: string, method: string, reference = ''): void {
      setValue(fixture, '#recovery-amount', amount);
      selectOption(fixture, '#recovery-method', method);
      if (reference) {
        setValue(fixture, '#recovery-reference', reference);
      }
    }

    function fieldErrors(controlId: string): string {
      return textOf(fixture, `#${controlId}-errors`);
    }

    beforeEach(() => {
      create(noticeSent());
      openDialog('RecordRecovery');
    });

    it('opens a form that shows the outstanding balance and starts with today as the recovery date', () => {
      expect(textOf(fixture, '[data-recovery-summary]')).toBe('Outstanding balance $750.00 of $1,000.00.');
      expect(query<HTMLInputElement>(fixture, '#recovery-date')?.value).toBe(todayIso());
      expect(query<HTMLInputElement>(fixture, '#recovery-amount')?.value).toBe('');
    });

    it('records nothing and says what is missing when the form is empty', () => {
      confirmDialog();

      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
      expect(fieldErrors('recovery-amount')).toBe('Amount is required.');
      expect(fieldErrors('recovery-method')).toBe('Method is required.');
      expect(isDialogOpen()).toBeTrue();
    });

    it('does not accept an amount of zero or less', () => {
      fillRecovery('0', 'Offset');

      confirmDialog();

      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
      expect(fieldErrors('recovery-amount')).toBe('Must be greater than 0.');
    });

    it('does not accept more than the outstanding balance', () => {
      fillRecovery('750.01', 'Offset');

      confirmDialog();

      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
      expect(fieldErrors('recovery-amount')).toBe('Amount cannot be more than the outstanding balance of $750.00.');
    });

    it('does not accept fractions of a cent', () => {
      fillRecovery('10.005', 'Offset');

      confirmDialog();

      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
      expect(fieldErrors('recovery-amount')).toBe('Use at most 2 decimal places.');
    });

    it('fills in the whole outstanding balance with "Use balance"', () => {
      click(fixture, '[data-action="use-outstanding"]');

      expect(query<HTMLInputElement>(fixture, '#recovery-amount')?.value).toBe('750');
    });

    it('does not accept a recovery date in the future', () => {
      fillRecovery('100', 'Offset');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const pad = (value: number): string => String(value).padStart(2, '0');
      setValue(fixture, '#recovery-date', `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`);

      confirmDialog();

      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
      expect(fieldErrors('recovery-date')).toBe('The date cannot be in the future.');
    });

    it('does not accept a recovery date before the notice was sent', () => {
      fillRecovery('100', 'Offset');
      setValue(fixture, '#recovery-date', '2025-02-28');

      confirmDialog();

      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
      expect(fieldErrors('recovery-date')).toBe('Recovery date cannot be before the notice date (3/1/2025).');
    });

    it('requires a reference number for a check', () => {
      fillRecovery('100', 'Check');

      confirmDialog();

      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
      expect(fieldErrors('recovery-reference')).toBe('A reference number is required for check and EFT recoveries.');
    });

    it('requires a reference number for an EFT payment', () => {
      fillRecovery('100', 'EFT');

      confirmDialog();

      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
      expect(fieldErrors('recovery-reference')).toBe('A reference number is required for check and EFT recoveries.');
    });

    it('does not require a reference number for an offset', () => {
      takebacks.recordRecovery.and.returnValue(of(after({ status: TakebackStatus.PartiallyRecovered, recoveredAmount: 350, outstandingAmount: 650 })));
      fillRecovery('100', 'Offset');

      confirmDialog();

      expect(takebacks.recordRecovery).toHaveBeenCalledTimes(1);
    });

    it('sends the recovery with the takeback id and the rowVersion and shows the returned takeback', () => {
      takebacks.recordRecovery.and.returnValue(
        of(
          after({
            status: TakebackStatus.PartiallyRecovered,
            noticeDate: '2025-03-01T00:00:00',
            dueDate: '2025-03-31T00:00:00',
            recoveredAmount: 500,
            outstandingAmount: 500,
            recoveries: [
              buildRecovery(),
              buildRecovery({ recoveryId: 2, amount: 250, referenceNumber: 'CHK-77', recoveryDate: '2025-03-25T00:00:00' })
            ],
            availableActions: ['RecordRecovery', 'Dispute', 'WriteOff']
          })
        )
      );
      fillRecovery('250', 'Check', ' CHK-77 ');
      setValue(fixture, '#recovery-notes', '  Mailed on Monday.  ');

      confirmDialog();

      expect(takebacks.recordRecovery).toHaveBeenCalledOnceWith({
        takebackId: 7,
        amount: 250,
        recoveryDate: todayIso(),
        method: RecoveryMethod.Check,
        referenceNumber: 'CHK-77',
        notes: 'Mailed on Monday.',
        rowVersion: TEST_ROW_VERSION
      });
      expect(isDialogOpen()).toBeFalse();
      expect(notifications.success).toHaveBeenCalledOnceWith('Recovery recorded for takeback TB-000007.');
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Partially Recovered');
      expect(textOf(fixture, '[data-amount="recovered"]')).toBe('$500.00');
      expect(textOf(fixture, '[data-amount="outstanding"]')).toBe('$500.00');
      expect(query(fixture, '[data-progress]')?.getAttribute('aria-valuenow')).toBe('50');
      expect(queryAll(fixture, '[data-recovery-row]').length).toBe(2);
      expect(component.takeback?.rowVersion).toBe(NEW_ROW_VERSION);
    });

    it('announces that the takeback is fully recovered when nothing is left', () => {
      takebacks.recordRecovery.and.returnValue(
        of(after({ status: TakebackStatus.Recovered, recoveredAmount: 1000, outstandingAmount: 0, availableActions: [] }))
      );
      fillRecovery('750', 'Offset');

      confirmDialog();

      expect(notifications.success).toHaveBeenCalledOnceWith('Recovery recorded. Takeback TB-000007 is fully recovered.');
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Recovered');
      expect(actionButtons()).toEqual([]);
    });

    it('puts validation messages of the server on their fields and the rest into the alert of the form', () => {
      takebacks.recordRecovery.and.returnValue(
        throwError(() =>
          apiError('VALIDATION', 'Validation failed.', [
            { field: 'referenceNumber', message: 'This reference was already recorded.' },
            { field: null, message: 'The recovery could not be recorded.' }
          ])
        )
      );
      fillRecovery('100', 'Check', 'CHK-1001');

      confirmDialog();

      expect(fieldErrors('recovery-reference')).toBe('This reference was already recorded.');
      expect(textOf(fixture, '[role="dialog"] [data-form-alert]')).toContain('The recovery could not be recorded.');
      expect(isDialogOpen()).toBeTrue();
    });

    it('shows a business rule that stopped the recovery in the alert of the form', () => {
      takebacks.recordRecovery.and.returnValue(throwError(() => apiError('BUSINESS_RULE', 'The takeback is not open for recoveries.')));
      fillRecovery('100', 'Offset');

      confirmDialog();

      expect(textOf(fixture, '[role="dialog"] [data-form-alert]')).toContain('The takeback is not open for recoveries.');
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeFalse();
    });

    it('replaces the dialog with the concurrency panel when somebody else changed the takeback', () => {
      takebacks.recordRecovery.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed by another user.')));
      fillRecovery('100', 'Offset');

      confirmDialog();

      expect(isDialogOpen()).toBeFalse();
      expect(query(fixture, '[data-concurrency-panel]')).not.toBeNull();
      expect(notifications.error).not.toHaveBeenCalled();
    });

    it('blocks a second request while the first is running', () => {
      const pending = new Subject<Takeback>();
      takebacks.recordRecovery.and.returnValue(pending);
      fillRecovery('100', 'Offset');

      confirmDialog();
      confirmDialog();

      expect(takebacks.recordRecovery).toHaveBeenCalledTimes(1);
      expect(query<HTMLButtonElement>(fixture, '[data-dialog-confirm]')?.disabled).toBeTrue();
    });

    it('closes without a call when the user cancels', () => {
      fillRecovery('100', 'Offset');

      dismissDialog();

      expect(isDialogOpen()).toBeFalse();
      expect(takebacks.recordRecovery).not.toHaveBeenCalled();
    });
  });

  describe('ResolveDispute', () => {
    beforeEach(() => {
      create(buildTakeback({ status: TakebackStatus.Disputed, availableActions: ['ResolveDispute'] }));
      openDialog('ResolveDispute');
    });

    it('needs a decision and a comment', () => {
      confirmDialog();

      expect(takebacks.resolveDispute).not.toHaveBeenCalled();
      expect(textOf(fixture, '#resolve-upheld-errors')).toBe('Decision is required.');
      expect(textOf(fixture, '#resolve-comment-errors')).toBe('Comment is required.');
      expect(isDialogOpen()).toBeTrue();
    });

    it('upholds the takeback: it stands and recovery resumes', () => {
      takebacks.resolveDispute.and.returnValue(
        of(after({ status: TakebackStatus.NoticeSent, availableActions: ['RecordRecovery', 'Dispute', 'WriteOff'] }))
      );
      setChecked(fixture, '#resolve-upheld', true);
      setValue(fixture, '#resolve-comment', '  The provider billed correctly.  ');

      confirmDialog();

      expect(takebacks.resolveDispute).toHaveBeenCalledOnceWith({
        takebackId: 7,
        comment: 'The provider billed correctly.',
        rowVersion: TEST_ROW_VERSION,
        upheld: true
      });
      expect(isDialogOpen()).toBeFalse();
      expect(notifications.success).toHaveBeenCalledOnceWith('Dispute upheld: takeback TB-000007 stands.');
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Notice Sent');
      expect(actionButtons()).toEqual(['RecordRecovery', 'Dispute', 'WriteOff']);
    });

    it('overturns the dispute: the takeback is cancelled', () => {
      takebacks.resolveDispute.and.returnValue(of(after({ status: TakebackStatus.Cancelled, availableActions: [] })));
      setChecked(fixture, '#resolve-overturned', true);
      setValue(fixture, '#resolve-comment', 'The other carrier paid.');

      confirmDialog();

      expect(takebacks.resolveDispute.calls.mostRecent().args[0].upheld).toBeFalse();
      expect(notifications.success).toHaveBeenCalledOnceWith('Dispute overturned: takeback TB-000007 was cancelled.');
      expect(textOf(fixture, '.page-header app-status-badge .badge')).toBe('Cancelled');
    });

    it('keeps the dialog open and shows the message of a rejected request', () => {
      takebacks.resolveDispute.and.returnValue(throwError(() => apiError('BUSINESS_RULE', 'The takeback is not disputed any more.')));
      setChecked(fixture, '#resolve-upheld', true);
      setValue(fixture, '#resolve-comment', 'Upheld.');

      confirmDialog();

      expect(textOf(fixture, '[role="dialog"] [data-form-alert]')).toContain('The takeback is not disputed any more.');
      expect(isDialogOpen()).toBeTrue();
    });

    it('replaces the dialog with the concurrency panel when somebody else changed the takeback', () => {
      takebacks.resolveDispute.and.returnValue(throwError(() => apiError('CONCURRENCY', 'Changed by another user.')));
      setChecked(fixture, '#resolve-upheld', true);
      setValue(fixture, '#resolve-comment', 'Upheld.');

      confirmDialog();

      expect(isDialogOpen()).toBeFalse();
      expect(query(fixture, '[data-concurrency-panel]')).not.toBeNull();
    });

    it('blocks a second request while the first is running', () => {
      const pending = new Subject<Takeback>();
      takebacks.resolveDispute.and.returnValue(pending);
      setChecked(fixture, '#resolve-upheld', true);
      setValue(fixture, '#resolve-comment', 'Upheld.');

      confirmDialog();
      confirmDialog();

      expect(takebacks.resolveDispute).toHaveBeenCalledTimes(1);
    });
  });

  describe('recoveries', () => {
    it('lists the recoveries of the takeback with method, amount, reference and author', () => {
      create(noticeSent());

      const rows = queryAll(fixture, '[data-recovery-row]');
      expect(rows.length).toBe(1);
      expect(cells(rows[0])).toEqual(['3/20/2025', 'Check', '$250.00', 'CHK-1001', '', `Ana Analyst ${localTime(TEST_TIMESTAMP)}`]);
      expect(textOf(fixture, '[data-recovered-total]')).toBe('$250.00');
    });

    it('shows the newest recovery first and breaks a tie with the later entry', () => {
      create(
        noticeSent({
          recoveries: [
            buildRecovery({ recoveryId: 1, recoveryDate: '2025-03-10T00:00:00', referenceNumber: 'REF-1' }),
            buildRecovery({ recoveryId: 2, recoveryDate: '2025-03-20T00:00:00', referenceNumber: 'REF-2' }),
            buildRecovery({ recoveryId: 3, recoveryDate: '2025-03-20T00:00:00', referenceNumber: 'REF-3' })
          ]
        })
      );

      const references = queryAll(fixture, '[data-recovery-row]').map(row => cells(row)[3]);
      expect(references).toEqual(['REF-3', 'REF-2', 'REF-1']);
    });

    it('names the method with the lookup and shows a dash for a missing reference', () => {
      create(noticeSent({ recoveries: [buildRecovery({ method: RecoveryMethod.Eft, referenceNumber: null, notes: 'Via the portal.' })] }));

      const row = queryAll(fixture, '[data-recovery-row]')[0];
      expect(cells(row).slice(1, 5)).toEqual(['EFT', '$250.00', '—', 'Via the portal.']);
    });

    it('says so when nothing was recovered yet', () => {
      create(buildTakeback());

      expect(textOf(fixture, '[data-empty="recoveries"]')).toBe('No recoveries have been recorded yet.');
      expect(query(fixture, '[data-recoveries]')).toBeNull();
    });
  });

  describe('linked activities', () => {
    it('lists the activities of the takeback with links to them', () => {
      create(
        buildTakeback({
          linkedActivities: [
            buildActivityListItem({ activityId: 5, activityNumber: 'ACT-000005', priority: ActivityPriority.High, status: ActivityStatus.InProgress })
          ]
        })
      );

      const rows = queryAll(fixture, '[data-activity-row]');
      expect(rows.length).toBe(1);
      expect(cells(rows[0])).toEqual(['ACT-000005', 'Verify other coverage', 'Phone Call', 'In Progress', 'High', 'Ana Analyst', '3/14/2025']);
      expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/activities/5');
    });

    it('colours the status and the priority and flags an overdue activity', () => {
      create(
        buildTakeback({
          linkedActivities: [buildActivityListItem({ status: ActivityStatus.Completed, priority: ActivityPriority.Urgent, isOverdue: true })]
        })
      );

      const row = queryAll(fixture, '[data-activity-row]')[0];
      const badges = Array.from(row.querySelectorAll('app-status-badge .badge'));
      expect(badges.map(badge => badge.classList.contains('text-bg-success'))).toEqual([true, false]);
      expect(badges[1].classList).toContain('text-bg-danger');
      expect(row.querySelector('td:last-child app-overdue-badge .badge')?.textContent?.trim()).toBe('Overdue');
    });

    it('shows Unassigned and a dash for an activity without assignee and due date', () => {
      create(buildTakeback({ linkedActivities: [buildActivityListItem({ assignedToUserId: null, assignedToName: null, dueDate: null })] }));

      const row = cells(queryAll(fixture, '[data-activity-row]')[0]);
      expect(row[5]).toBe('Unassigned');
      expect(row[6]).toBe('—');
    });

    it('says so when no activity is linked', () => {
      create(buildTakeback());

      expect(textOf(fixture, '[data-empty="activities"]')).toBe('No activities are linked to this takeback.');
      expect(query(fixture, '[data-linked-activities]')).toBeNull();
    });
  });

  describe('history', () => {
    const timeline = [
      buildHistoryEntry({ historyId: 1, action: TakebackAction.Create, fromStatus: null, toStatus: TakebackStatus.Draft, changedDate: '2025-03-10T09:00:00Z' }),
      buildHistoryEntry({
        historyId: 2,
        action: TakebackAction.Submit,
        fromStatus: TakebackStatus.Draft,
        toStatus: TakebackStatus.PendingApproval,
        changedDate: '2025-03-11T09:00:00Z'
      }),
      buildHistoryEntry({
        historyId: 3,
        action: TakebackAction.Reject,
        fromStatus: TakebackStatus.PendingApproval,
        toStatus: TakebackStatus.Rejected,
        comment: 'Missing the claim copy.',
        changedByName: 'Sam Supervisor',
        changedDate: '2025-03-12T09:00:00Z'
      })
    ];

    it('lists the newest entry first', () => {
      create(buildTakeback({ history: timeline }));

      expect(texts(fixture.nativeElement as HTMLElement, '[data-history-action]')).toEqual(['Reject', 'Submit', 'Create']);
    });

    it('shows the change of status as badges, without a "from" for the first entry', () => {
      create(buildTakeback({ history: timeline }));

      const entries = queryAll(fixture, '[data-history-entry]');
      expect(texts(entries[0], 'app-status-badge .badge')).toEqual(['Pending Approval', 'Rejected']);
      expect(texts(entries[0], '.visually-hidden')).toEqual(['from', 'to']);
      expect(texts(entries[2], 'app-status-badge .badge')).toEqual(['Draft']);
      expect(texts(entries[2], '.visually-hidden')).toEqual(['to']);
    });

    it('shows the comment only for entries that have one', () => {
      create(buildTakeback({ history: timeline }));

      expect(texts(fixture.nativeElement as HTMLElement, '[data-history-comment]')).toEqual(['Missing the claim copy.']);
    });

    it('shows who changed the record and when, in local time', () => {
      create(buildTakeback({ history: timeline }));

      const first = queryAll(fixture, '[data-history-entry]')[0];
      expect(texts(first, '.small')).toEqual([`Sam Supervisor · ${localTime('2025-03-12T09:00:00Z')}`]);
    });

    it('writes the actions the way people say them', () => {
      create(
        buildTakeback({
          history: [
            buildHistoryEntry({ historyId: 1, action: TakebackAction.SendNotice, changedDate: '2025-03-01T09:00:00Z' }),
            buildHistoryEntry({ historyId: 2, action: TakebackAction.RecordRecovery, changedDate: '2025-03-02T09:00:00Z' }),
            buildHistoryEntry({ historyId: 3, action: TakebackAction.ResolveDispute, changedDate: '2025-03-03T09:00:00Z' }),
            buildHistoryEntry({ historyId: 4, action: TakebackAction.WriteOff, changedDate: '2025-03-04T09:00:00Z' })
          ]
        })
      );

      expect(texts(fixture.nativeElement as HTMLElement, '[data-history-action]')).toEqual([
        'Write off',
        'Resolve dispute',
        'Record recovery',
        'Send notice'
      ]);
    });

    it('puts the entry with the higher id first when two entries have the same time', () => {
      create(
        buildTakeback({
          history: [
            buildHistoryEntry({ historyId: 1, action: TakebackAction.Approve, changedDate: '2025-03-01T09:00:00Z' }),
            buildHistoryEntry({ historyId: 2, action: TakebackAction.SendNotice, changedDate: '2025-03-01T09:00:00Z' })
          ]
        })
      );

      expect(texts(fixture.nativeElement as HTMLElement, '[data-history-action]')).toEqual(['Send notice', 'Approve']);
    });

    it('says so when there is no history', () => {
      create(buildTakeback({ history: [] }));

      expect(textOf(fixture, '[data-empty="history"]')).toBe('There is no history yet.');
      expect(query(fixture, '[data-history]')).toBeNull();
    });

    it('shows the new entry of the returned takeback after an action', () => {
      takebacks.submit.and.returnValue(
        of(
          after({
            status: TakebackStatus.PendingApproval,
            availableActions: [],
            history: [
              buildHistoryEntry(),
              buildHistoryEntry({
                historyId: 2,
                action: TakebackAction.Submit,
                fromStatus: TakebackStatus.Draft,
                toStatus: TakebackStatus.PendingApproval,
                changedDate: '2025-03-15T09:00:00Z'
              })
            ]
          })
        )
      );
      create(buildTakeback({ availableActions: ['Submit'] }));
      expect(queryAll(fixture, '[data-history-entry]').length).toBe(1);

      openDialog('Submit');
      confirmDialog();

      expect(texts(fixture.nativeElement as HTMLElement, '[data-history-action]')).toEqual(['Submit', 'Create']);
    });
  });
});
