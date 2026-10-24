import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { DashboardSummary } from '../../models/models';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private readonly api: ApiService) {}

  /** GET /api/Dashboard/GetSummary */
  getSummary(): Observable<DashboardSummary> {
    return this.api.get<DashboardSummary>('Dashboard/GetSummary');
  }
}
