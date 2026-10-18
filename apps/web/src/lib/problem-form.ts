import { ApiError, getErrorMessage, NETWORK_ERROR_CODE } from './api-client';

export interface CodeRule {
  /** Form field that receives the message; omit for a form-level message. */
  field?: string;
  message: string;
}

export interface ProblemFormOptions {
  /** Server `FieldError.field` (dot path) to form field name. */
  fieldMap?: Readonly<Record<string, string>>;
  /** Stable error codes with their own copy. */
  codeRules?: Readonly<Record<string, CodeRule>>;
}

export interface ProblemFormResult {
  fields: Record<string, string>;
  /** Form-level message (top-of-form alert), or null when every error landed on a field. */
  form: string | null;
  error: unknown;
  status: number | undefined;
  code: string | undefined;
  retryAfterSeconds: number | undefined;
  /** No response was received, so a create may or may not have been committed. */
  networkUnknown: boolean;
}

/**
 * Maps a failed request to field errors and one form-level message (ui-design 18.0.3).
 * Unmapped server field errors and every other failure go to the form-level message. Server
 * text is returned as plain strings and must be rendered as text.
 */
export function applyProblemToForm(
  error: unknown,
  options: ProblemFormOptions = {},
): ProblemFormResult {
  const fields: Record<string, string> = {};
  let form: string | null = null;
  const apiError = error instanceof ApiError ? error : null;
  const result = (): ProblemFormResult => ({
    fields,
    form,
    error,
    status: apiError?.status,
    code: apiError?.code,
    retryAfterSeconds: apiError?.retryAfterSeconds,
    networkUnknown: apiError?.code === NETWORK_ERROR_CODE,
  });

  if (!apiError) {
    form = getErrorMessage(error);
    return result();
  }

  const rule = options.codeRules?.[apiError.code];
  if (rule) {
    if (rule.field) fields[rule.field] = rule.message;
    else form = rule.message;
    return result();
  }

  if (apiError.status === 429) {
    const wait = apiError.retryAfterSeconds;
    form = wait
      ? `Too many attempts. Try again in ${wait} seconds.`
      : 'Too many attempts. Wait a moment and try again.';
    return result();
  }

  const unmapped: string[] = [];
  for (const fieldError of apiError.fieldErrors) {
    const target = options.fieldMap?.[fieldError.field];
    if (target) fields[target] ??= fieldError.message;
    else unmapped.push(fieldError.message);
  }
  if (unmapped.length > 0) form = unmapped.join(' ');
  else if (Object.keys(fields).length === 0) form = getErrorMessage(error);
  return result();
}
