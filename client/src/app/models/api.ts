/** One field-level (or general, when `field` is null) validation message. Mirrors CobLink.Models.ValidationError. */
export interface ValidationError {
  field: string | null;
  message: string;
}

/** The envelope every /api response is wrapped in (ServiceResponse<T> on the server). */
export interface ServiceResponse<T> {
  success: boolean;
  message: string | null;
  errorCode: string | null;
  errors: ValidationError[];
  /** Null when `success` is false. */
  data: T;
}

/** Error codes of the envelope plus the codes the client invents for failures that carry no envelope. */
export const ErrorCodes = {
  validation: 'VALIDATION',
  businessRule: 'BUSINESS_RULE',
  notFound: 'NOT_FOUND',
  concurrency: 'CONCURRENCY',
  forbidden: 'FORBIDDEN',
  badRequest: 'BAD_REQUEST',
  serverError: 'SERVER_ERROR',
  unauthenticated: 'UNAUTHENTICATED',
  network: 'NETWORK',
  unavailable: 'UNAVAILABLE',
  unexpected: 'UNEXPECTED'
} as const;

/** The only error type the data services emit: a failed call, whatever the transport said. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly errors: ValidationError[] = []
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Wraps anything that was thrown so callers can always rely on an ApiError. */
  static from(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error;
    }
    const message = error instanceof Error && error.message ? error.message : 'An unexpected error occurred.';
    return new ApiError(0, ErrorCodes.unexpected, message);
  }

  get isConcurrency(): boolean {
    return this.errorCode === ErrorCodes.concurrency;
  }

  get isForbidden(): boolean {
    return this.errorCode === ErrorCodes.forbidden;
  }

  get isValidation(): boolean {
    return this.errorCode === ErrorCodes.validation;
  }

  /** Validation messages grouped by (camelCase) field name. Errors without a field are not included. */
  fieldErrors(): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    for (const error of this.errors) {
      if (!error.field) {
        continue;
      }
      (grouped[error.field] = grouped[error.field] ?? []).push(error.message);
    }
    return grouped;
  }

  /** Validation messages that are not tied to a field. */
  generalErrors(): string[] {
    return this.errors.filter(error => !error.field).map(error => error.message);
  }
}
