import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../platform/errors.js';
import type { AuthContext, AuthService } from './service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the guard on every protected route. Null on public routes. */
    auth: AuthContext | null;
  }
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]{1,2048}={0,2})$/i;
/** Refresh cookie charset: base64url plus the dot between the session id and the secret. */
const COOKIE_VALUE = /^[A-Za-z0-9._-]{16,128}$/;

/** Extracts a bearer token, or null when the header is absent or malformed. */
export function bearerToken(header: string | undefined): string | null {
  const match = header ? BEARER.exec(header) : null;
  return match?.[1] ?? null;
}

/** Reads one cookie. A value that is not a plausible opaque token is treated as missing. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return COOKIE_VALUE.test(value) ? value : undefined;
  }
  return undefined;
}

/**
 * onRequest hook for the protected scope: verifies the bearer token and the session, then sets
 * `request.auth`. Registered once for the whole scope, so a new route cannot forget it.
 */
export function createAuthGuard(service: AuthService) {
  return async function authGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const token = bearerToken(request.headers.authorization);
      if (!token) throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
      request.auth = await service.authenticate(token);
    } catch (error) {
      reply.header('WWW-Authenticate', 'Bearer');
      throw error;
    }
  };
}

/** The authenticated principal; throws if a handler runs outside the guarded scope. */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
  return request.auth;
}

/**
 * onRequest hook for the admin scope, registered after the authentication guard. The role comes
 * from the database row loaded for this request (never from the token), so a demotion or
 * suspension takes effect on the next call. Services re-check what they change under lock.
 */
export async function requireAdminGuard(request: FastifyRequest): Promise<void> {
  if (requireAuth(request).role !== 'admin') {
    throw new AppError('FORBIDDEN', 'You do not have permission to perform this action.');
  }
}

/**
 * Cookie-authenticated endpoints are CSRF-prone, so beyond SameSite=Strict they require the app
 * Origin and a custom header that a cross-site form cannot set (architecture 9).
 */
export function assertCsrfProtected(request: FastifyRequest, appOrigin: string): void {
  const origin = request.headers.origin;
  const marker = request.headers['x-csrf-protection'];
  if (origin !== appOrigin || marker !== '1') {
    throw new AppError('FORBIDDEN', 'The request was rejected.');
  }
}
