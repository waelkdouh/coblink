import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  Activity,
  ActivityActionRequest,
  ActivityListItem,
  ActivitySearchRequest,
  AddActivityNoteRequest,
  PagedResult,
  SaveActivityRequest
} from '../../models/models';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  constructor(private readonly api: ApiService) {}

  /** POST /api/Activity/Search */
  search(request: ActivitySearchRequest): Observable<PagedResult<ActivityListItem>> {
    return this.api.post<PagedResult<ActivityListItem>>('Activity/Search', request);
  }

  /** GET /api/Activity/GetById?id= */
  getById(activityId: number): Observable<Activity> {
    return this.api.get<Activity>('Activity/GetById', { id: activityId });
  }

  /** POST /api/Activity/Save - creates when activityId is 0. */
  save(request: SaveActivityRequest): Observable<Activity> {
    return this.api.post<Activity>('Activity/Save', request);
  }

  /** POST /api/Activity/Complete - comment is the outcome (required). */
  complete(request: ActivityActionRequest): Observable<Activity> {
    return this.api.post<Activity>('Activity/Complete', request);
  }

  /** POST /api/Activity/Reopen - comment is optional. */
  reopen(request: ActivityActionRequest): Observable<Activity> {
    return this.api.post<Activity>('Activity/Reopen', request);
  }

  /** POST /api/Activity/Cancel - comment is the reason (required). */
  cancel(request: ActivityActionRequest): Observable<Activity> {
    return this.api.post<Activity>('Activity/Cancel', request);
  }

  /** POST /api/Activity/AddNote */
  addNote(request: AddActivityNoteRequest): Observable<Activity> {
    return this.api.post<Activity>('Activity/AddNote', request);
  }
}
