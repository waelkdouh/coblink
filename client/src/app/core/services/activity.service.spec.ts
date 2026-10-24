import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ActivityPriority, ActivityStatus, ActivityType } from '../../models/enums';
import { ActivitySearchRequest, SaveActivityRequest } from '../../models/models';
import { TEST_ROW_VERSION, buildActivity, buildActivityListItem, buildPage } from '../../testing/test-data';
import { envelope, failedEnvelope } from '../../testing/test-helpers';
import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  let service: ActivityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ActivityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('search POSTs the filter, paging and sort to Activity/Search', () => {
    const search: ActivitySearchRequest = {
      pageNumber: 2,
      pageSize: 50,
      sortBy: 'dueDate',
      sortDescending: true,
      searchText: 'call',
      status: ActivityStatus.Open,
      openOnly: true,
      overdueOnly: false,
      assignedToUserId: 3
    };
    const page = buildPage([buildActivityListItem()], { pageNumber: 2, pageSize: 50, totalCount: 51 });
    let result: unknown;

    service.search(search).subscribe(value => (result = value));

    const request = http.expectOne('/api/Activity/Search');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(search);
    request.flush(envelope(page));
    expect(result).toEqual(page);
  });

  it('getById GETs Activity/GetById with the id as query parameter', () => {
    const activity = buildActivity({ activityId: 42 });
    let result: unknown;

    service.getById(42).subscribe(value => (result = value));

    const request = http.expectOne(req => req.url === '/api/Activity/GetById');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('id')).toBe('42');
    request.flush(envelope(activity));
    expect(result).toEqual(activity);
  });

  it('save POSTs the whole request including the rowVersion', () => {
    const save: SaveActivityRequest = {
      activityId: 5,
      memberId: 11,
      takebackId: null,
      activityType: ActivityType.Email,
      priority: ActivityPriority.High,
      status: ActivityStatus.InProgress,
      subject: 'Follow up',
      description: null,
      assignedToUserId: 1,
      dueDate: '2025-03-14',
      rowVersion: TEST_ROW_VERSION
    };

    service.save(save).subscribe();

    const request = http.expectOne('/api/Activity/Save');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(save);
    request.flush(envelope(buildActivity()));
  });

  it('complete, reopen and cancel POST the comment with the rowVersion', () => {
    const body = { activityId: 5, comment: 'Reached the member.', rowVersion: TEST_ROW_VERSION };

    service.complete(body).subscribe();
    service.reopen({ ...body, comment: null }).subscribe();
    service.cancel({ ...body, comment: 'No longer needed.' }).subscribe();

    const complete = http.expectOne('/api/Activity/Complete');
    expect(complete.request.method).toBe('POST');
    expect(complete.request.body).toEqual(body);
    complete.flush(envelope(buildActivity()));

    const reopen = http.expectOne('/api/Activity/Reopen');
    expect(reopen.request.body).toEqual({ ...body, comment: null });
    reopen.flush(envelope(buildActivity()));

    const cancel = http.expectOne('/api/Activity/Cancel');
    expect((cancel.request.body as { comment: string }).comment).toBe('No longer needed.');
    cancel.flush(envelope(buildActivity()));
  });

  it('addNote POSTs the note text and returns the refreshed activity', () => {
    const updated = buildActivity({ notes: [] });
    let result: unknown;

    service.addNote({ activityId: 5, noteText: 'Left a voicemail.' }).subscribe(value => (result = value));

    const request = http.expectOne('/api/Activity/AddNote');
    expect(request.request.body).toEqual({ activityId: 5, noteText: 'Left a voicemail.' });
    request.flush(envelope(updated));
    expect(result).toEqual(updated);
  });

  it('surfaces a failed envelope as an error', () => {
    let code = '';

    service.complete({ activityId: 5, comment: '', rowVersion: TEST_ROW_VERSION }).subscribe({
      error: (error: { errorCode: string }) => (code = error.errorCode)
    });

    http.expectOne('/api/Activity/Complete').flush(failedEnvelope('VALIDATION', 'Outcome is required.'));
    expect(code).toBe('VALIDATION');
  });
});
