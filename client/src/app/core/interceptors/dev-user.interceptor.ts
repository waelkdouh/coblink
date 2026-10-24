import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { DevPersonaStorage } from '../services/dev-persona-storage.service';

/**
 * Development only: adds the persona chosen in the navbar as the X-CobLink-User header of every /api call.
 * The API ignores the header unless it runs in Development, Testing or Demo mode.
 */
@Injectable()
export class DevUserInterceptor implements HttpInterceptor {
  static readonly headerName = 'X-CobLink-User';

  constructor(private readonly persona: DevPersonaStorage) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const userName = this.persona.get();
    if (userName && this.isApiCall(request.url)) {
      return next.handle(request.clone({ setHeaders: { [DevUserInterceptor.headerName]: userName } }));
    }
    return next.handle(request);
  }

  private isApiCall(url: string): boolean {
    return /^(https?:\/\/[^/]+)?\/api\//i.test(url);
  }
}
