import type { AuthSession, FieldError, Problem, User } from '@midas/shared';

/*
 * Runtime guards for the two payloads the client itself must understand (session and problem).
 * Types come from @midas/shared (type-only imports, erased at build time). The shared package's
 * barrel pulls the password-strength dictionaries (~2 MB) into any runtime import and is not
 * marked side-effect free, so the web bundle validates these shapes locally instead.
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

function parseFieldErrors(value: unknown): FieldError[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const errors: FieldError[] = [];
  for (const entry of value) {
    if (
      isObject(entry) &&
      isString(entry['field']) &&
      isString(entry['code']) &&
      isString(entry['message'])
    ) {
      errors.push({ field: entry['field'], code: entry['code'], message: entry['message'] });
    }
  }
  return errors;
}

/** Returns a Problem when the body has the RFC 9457 shape used by the API, else undefined. */
export function parseProblem(body: unknown): Problem | undefined {
  if (!isObject(body)) return undefined;
  const { type, title, status, detail, instance, code, requestId } = body;
  if (
    !isString(type) ||
    !isString(title) ||
    typeof status !== 'number' ||
    !isString(detail) ||
    !isString(instance) ||
    !isString(code) ||
    !isString(requestId)
  ) {
    return undefined;
  }
  const errors = parseFieldErrors(body['errors']);
  return { type, title, status, detail, instance, code, requestId, ...(errors ? { errors } : {}) };
}

/** Throws unless the body is a well-formed User (the fields the UI reads). */
export function parseUser(body: unknown): User {
  if (
    !isObject(body) ||
    !isString(body['id']) ||
    !isString(body['email']) ||
    !isString(body['displayName']) ||
    (body['role'] !== 'user' && body['role'] !== 'admin') ||
    !isObject(body['preferences'])
  ) {
    throw new Error('Invalid user response');
  }
  const preferences = body['preferences'];
  if (
    !isString(preferences['currency']) ||
    !isString(preferences['locale']) ||
    !isString(preferences['timezone']) ||
    !isString(preferences['theme'])
  ) {
    throw new Error('Invalid user response');
  }
  return body as unknown as User;
}

/** Throws unless the body is a well-formed AuthSession (token, expiry and the user). */
export function parseAuthSession(body: unknown): AuthSession {
  if (!isObject(body) || !isString(body['accessToken']) || body['accessToken'] === '') {
    throw new Error('Invalid session response');
  }
  if (!isString(body['accessTokenExpiresAt'])) throw new Error('Invalid session response');
  parseUser(body['user']);
  return body as unknown as AuthSession;
}

export const authSessionParser = { parse: parseAuthSession };
export const userParser = { parse: parseUser };
