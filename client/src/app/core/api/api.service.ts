import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiError, ErrorCodes, ServiceResponse } from '../../models/api';

export type QueryParamValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryParamValue>;

const UNEXPECTED_RESPONSE = 'The COBLink service returned an unexpected response.';

/**
 * The only class that talks to HttpClient. It unwraps the ServiceResponse<T> envelope and turns every kind of
 * failure (success = false, HTTP errors, gateway pages, network loss) into an ApiError.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  static readonly baseUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http
      .get<ServiceResponse<T>>(this.buildUrl(path), { params: this.buildParams(params) })
      .pipe(
        catchError((error: unknown) => throwError(() => this.toApiError(error))),
        map(response => this.unwrap(response))
      );
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .post<ServiceResponse<T>>(this.buildUrl(path), body)
      .pipe(
        catchError((error: unknown) => throwError(() => this.toApiError(error))),
        map(response => this.unwrap(response))
      );
  }

  private buildUrl(path: string): string {
    return `${ApiService.baseUrl}/${path.replace(/^\/+/, '')}`;
  }

  private buildParams(params?: QueryParams): HttpParams {
    let httpParams = new HttpParams();
    if (params) {
      for (const key of Object.keys(params)) {
        const value = params[key];
        if (value !== null && value !== undefined && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      }
    }
    return httpParams;
  }

  private unwrap<T>(response: ServiceResponse<T> | null): T {
    if (!this.isEnvelope(response)) {
      throw new ApiError(200, ErrorCodes.unexpected, UNEXPECTED_RESPONSE);
    }
    if (!response.success) {
      throw new ApiError(
        200,
        response.errorCode ?? ErrorCodes.unexpected,
        response.message ?? 'The request could not be completed.',
        response.errors ?? []
      );
    }
    return response.data;
  }

  private toApiError(error: unknown): ApiError {
    if (!(error instanceof HttpErrorResponse)) {
      return ApiError.from(error);
    }

    const status = error.status;
    if (this.isEnvelope(error.error)) {
      const envelope = error.error;
      return new ApiError(
        status,
        envelope.errorCode ?? this.codeForStatus(status),
        envelope.message ?? this.messageForStatus(status),
        envelope.errors ?? []
      );
    }
    return new ApiError(status, this.codeForStatus(status), this.messageForStatus(status));
  }

  private isEnvelope(value: unknown): value is ServiceResponse<unknown> {
    return typeof value === 'object' && value !== null && typeof (value as { success?: unknown }).success === 'boolean';
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case 0:
        return ErrorCodes.network;
      case 400:
        return ErrorCodes.badRequest;
      case 401:
        return ErrorCodes.unauthenticated;
      case 403:
        return ErrorCodes.forbidden;
      case 404:
        return ErrorCodes.notFound;
      case 502:
      case 503:
      case 504:
        return ErrorCodes.unavailable;
      default:
        return status >= 500 ? ErrorCodes.serverError : ErrorCodes.unexpected;
    }
  }

  private messageForStatus(status: number): string {
    switch (status) {
      case 0:
        return 'Cannot reach the COBLink service. Check your network connection and try again.';
      case 400:
        return 'The request was not understood by the COBLink service.';
      case 401:
        return 'You are not authenticated. Sign in with your Windows account and try again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested COBLink resource was not found.';
      case 502:
      case 503:
      case 504:
        return 'The COBLink service is temporarily unavailable. Please try again in a few minutes.';
      default:
        if (status >= 500) {
          return 'The COBLink service reported an unexpected error. Please try again.';
        }
        return status === 200 ? UNEXPECTED_RESPONSE : `The request failed (HTTP ${status}).`;
    }
  }
}
