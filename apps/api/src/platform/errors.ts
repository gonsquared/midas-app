import { ERROR_STATUS, type ErrorCode, type FieldError, type Problem } from '@midas/shared';
import type { ZodError, ZodIssue } from 'zod';

const TITLES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHENTICATED: 'Authentication required',
  EMAIL_TAKEN: 'Email already registered',
  NOT_FOUND: 'Not found',
  RATE_LIMITED: 'Too many requests',
  INTERNAL_ERROR: 'Internal server error',
};

const GENERIC_TITLE_BY_STATUS: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Unprocessable request',
  429: 'Too many requests',
  500: 'Internal server error',
  503: 'Service unavailable',
};

/** An expected, client-visible failure. Anything else becomes a 500 INTERNAL_ERROR. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ErrorCode,
    public readonly detail: string,
    public readonly options: { errors?: FieldError[]; retryAfterSeconds?: number } = {},
  ) {
    super(detail);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }

  get errors(): FieldError[] | undefined {
    return this.options.errors;
  }

  get retryAfterSeconds(): number | undefined {
    return this.options.retryAfterSeconds;
  }
}

export function problemType(code: ErrorCode): string {
  return `https://midas.app/problems/${code.toLowerCase().replaceAll('_', '-')}`;
}

export function buildProblem(input: {
  code: ErrorCode;
  detail: string;
  instance: string;
  requestId: string;
  errors?: FieldError[] | undefined;
}): Problem {
  const status = ERROR_STATUS[input.code];
  const problem: Problem = {
    type: problemType(input.code),
    title: TITLES[input.code] ?? GENERIC_TITLE_BY_STATUS[status] ?? 'Error',
    status,
    detail: input.detail,
    instance: input.instance,
    code: input.code,
    requestId: input.requestId,
  };
  if (input.errors && input.errors.length > 0) problem.errors = input.errors;
  return problem;
}

function issueToFieldErrors(issue: ZodIssue): FieldError[] {
  const base = issue.path.map(String).join('.') || 'body';

  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({
      field: base === 'body' ? key : `${base}.${key}`,
      code: 'UNKNOWN_FIELD',
      message: 'Unknown field',
    }));
  }

  let code = 'INVALID_FORMAT';
  let message: string;
  if (issue.code === 'invalid_type' && /received undefined/.test(issue.message)) {
    code = 'REQUIRED';
    message = 'Required';
  } else if (issue.code === 'invalid_type') {
    code = 'INVALID_TYPE';
    message = 'Invalid type';
  } else if (issue.code === 'too_small') {
    code = issue.origin === 'string' ? 'TOO_SHORT' : 'TOO_SMALL';
    message = issue.message;
  } else if (issue.code === 'too_big') {
    code = issue.origin === 'string' ? 'TOO_LONG' : 'TOO_LARGE';
    message = issue.message;
  } else if (issue.code === 'custom') {
    const params = issue.params as { code?: unknown } | undefined;
    code = typeof params?.code === 'string' ? params.code : 'INVALID_VALUE';
    message = issue.message;
  } else if (issue.code === 'invalid_value') {
    code = 'INVALID_VALUE';
    message = 'Value is not allowed';
  } else {
    message = issue.message;
  }
  return [{ field: base, code, message }];
}

export function zodToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.flatMap(issueToFieldErrors);
}

export function validationError(error: ZodError): AppError {
  return new AppError('VALIDATION_FAILED', 'The request is invalid.', {
    errors: zodToFieldErrors(error),
  });
}
