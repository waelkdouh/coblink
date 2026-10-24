import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  PagedResult,
  RecordRecoveryRequest,
  ResolveDisputeRequest,
  SaveTakebackRequest,
  Takeback,
  TakebackActionRequest,
  TakebackListItem,
  TakebackSearchRequest
} from '../../models/models';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class TakebackService {
  constructor(private readonly api: ApiService) {}

  /** POST /api/Takeback/Search */
  search(request: TakebackSearchRequest): Observable<PagedResult<TakebackListItem>> {
    return this.api.post<PagedResult<TakebackListItem>>('Takeback/Search', request);
  }

  /** GET /api/Takeback/GetById?id= */
  getById(takebackId: number): Observable<Takeback> {
    return this.api.get<Takeback>('Takeback/GetById', { id: takebackId });
  }

  /** POST /api/Takeback/Save - creates when takebackId is 0. */
  save(request: SaveTakebackRequest): Observable<Takeback> {
    return this.api.post<Takeback>('Takeback/Save', request);
  }

  submit(request: TakebackActionRequest): Observable<Takeback> {
    return this.action('Submit', request);
  }

  approve(request: TakebackActionRequest): Observable<Takeback> {
    return this.action('Approve', request);
  }

  /** The comment is required. */
  reject(request: TakebackActionRequest): Observable<Takeback> {
    return this.action('Reject', request);
  }

  sendNotice(request: TakebackActionRequest): Observable<Takeback> {
    return this.action('SendNotice', request);
  }

  /** POST /api/Takeback/RecordRecovery */
  recordRecovery(request: RecordRecoveryRequest): Observable<Takeback> {
    return this.api.post<Takeback>('Takeback/RecordRecovery', request);
  }

  /** The comment is required. */
  dispute(request: TakebackActionRequest): Observable<Takeback> {
    return this.action('Dispute', request);
  }

  /** POST /api/Takeback/ResolveDispute - upheld keeps the takeback, otherwise it is cancelled. */
  resolveDispute(request: ResolveDisputeRequest): Observable<Takeback> {
    return this.api.post<Takeback>('Takeback/ResolveDispute', request);
  }

  /** The comment is required. */
  writeOff(request: TakebackActionRequest): Observable<Takeback> {
    return this.action('WriteOff', request);
  }

  /** The comment is required. */
  cancel(request: TakebackActionRequest): Observable<Takeback> {
    return this.action('Cancel', request);
  }

  private action(name: string, request: TakebackActionRequest): Observable<Takeback> {
    return this.api.post<Takeback>(`Takeback/${name}`, request);
  }
}
