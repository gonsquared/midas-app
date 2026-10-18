import type { AuthSession, FieldError } from '@midas/shared';
import { parseAuthSession, parseProblem } from './api-schemas';
import { defaultSessionStore, type SessionStore } from './session';

export const API_BASE_URL = '/api/v1';
const CSRF_HEADER = 'X-CSRF-Protection';
export const REFRESH_LOCK_NAME = 'midas-session-refresh';
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

/** Anything with a zod-style `parse`, so responses from the server are validated, not trusted. */
export interface Parser<T> {
  parse: (data: unknown) => T;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly fieldErrors: readonly FieldError[];
  /** Server-provided human text for 4xx problems. Rendered as text only. */
  readonly detail: string | undefined;
  /** Seconds from the Retry-After header (429 responses). */
  readonly retryAfterSeconds: number | undefined;

  constructor(init: {
    status: number;
    code: string;
    title: string;
    detail?: string | undefined;
    requestId?: string | undefined;
    fieldErrors?: readonly FieldError[] | undefined;
    retryAfterSeconds?: number | undefined;
  }) {
    super(init.title);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.requestId = init.requestId;
    this.fieldErrors = init.fieldErrors ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/** Friendly copy for the UI. Never exposes stack traces, paths or raw server text for 5xx. */
export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';
  if (error.code === NETWORK_ERROR_CODE) {
    return 'Midas cannot be reached. Check your connection and try again.';
  }
  if (error.status >= 500) return 'Something went wrong on our side. Try again in a moment.';
  if (error.status === 429) return 'Too many attempts. Wait a moment and try again.';
  if (error.status === 401) return 'Your session has ended. Sign in again.';
  if (error.status === 403) return 'You do not have access to that.';
  if (error.status === 404) return 'That could not be found.';
  return error.detail ?? 'That did not work. Check what you entered and try again.';
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Arrays become repeated keys (?walletId=a&walletId=b), as the API expects. */
  query?: Record<string, string | number | boolean | readonly string[] | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  /** Attach the bearer token and refresh once on 401. Defaults to true. */
  auth?: boolean;
  /** Send the CSRF header required by the refresh-cookie endpoints. */
  csrf?: boolean;
  /** Validates the JSON response body. Without it the body is returned unchecked. */
  parser?: Parser<T>;
}

export interface ApiClientDeps {
  baseUrl?: string;
  fetch?: typeof fetch;
  session?: SessionStore;
  /** Called after a refresh failed and the session was cleared (forced sign-out). */
  onSessionExpired?: () => void;
}

export interface ApiClient {
  request: <T = unknown>(path: string, options?: RequestOptions<T>) => Promise<T>;
  refresh: () => Promise<AuthSession | null>;
}

const BACKSLASH = String.fromCharCode(92);

export function buildUrl(
  baseUrl: string,
  path: string,
  query: RequestOptions<unknown>['query'],
): string {
  // Only app-relative API paths, so a caller-supplied value can never send traffic elsewhere.
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('://') ||
    path.includes(BACKSLASH)
  ) {
    throw new Error('API paths must be relative and start with a single slash');
  }
  // No query/fragment smuggling and no dot segments (an unencoded id like "../wallets").
  if (
    path.includes('?') ||
    path.includes('#') ||
    path.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('API paths must not contain ?, # or dot segments');
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (typeof value === 'object') for (const item of value) params.append(key, item);
    else params.set(key, String(value));
  }
  const search = params.toString();
  return `${baseUrl}${path}${search ? `?${search}` : ''}`;
}

/**
 * Runs the refresh under a Web Lock so tabs take turns: the server rotates the refresh token, so
 * two tabs refreshing at once would race (architecture 9). Falls back to a plain call where the
 * Locks API is missing (single-flight within the tab still applies).
 */
function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks || typeof locks.request !== 'function') return task();
  return locks.request(REFRESH_LOCK_NAME, task);
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get('Retry-After');
  if (!raw || !/^[0-9]{1,6}$/.test(raw)) return undefined;
  return Number(raw);
}

/** Maps an RFC 9457 Problem Details response (or anything else) to an ApiError. */
export async function toApiError(response: Response): Promise<ApiError> {
  const body = await readJson(response);
  const retryAfterSeconds = parseRetryAfter(response);
  const problem = parseProblem(body);
  if (problem) {
    return new ApiError({
      status: response.status,
      code: problem.code,
      title: problem.title,
      detail: problem.detail,
      requestId: problem.requestId,
      fieldErrors: problem.errors,
      retryAfterSeconds,
    });
  }
  return new ApiError({
    status: response.status,
    code: response.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN_ERROR',
    title: response.statusText || 'Request failed',
    requestId: response.headers.get('X-Request-Id') ?? undefined,
    retryAfterSeconds,
  });
}

export function createApiClient(deps: ApiClientDeps = {}): ApiClient {
  const baseUrl = deps.baseUrl ?? API_BASE_URL;
  const session = deps.session ?? defaultSessionStore;
  // Late-bound so tests (and polyfills) that replace globalThis.fetch are honored.
  const doFetch: typeof fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));

  let refreshing: Promise<AuthSession | null> | null = null;
  /** Set when the last refresh was definitively rejected (session cleared). */
  let refreshRejected = false;

  async function send(path: string, options: RequestOptions<unknown>): Promise<Response> {
    const headers = new Headers({ Accept: 'application/json' });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.csrf) headers.set(CSRF_HEADER, '1');
    const token = options.auth === false ? null : session.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    if (options.signal) init.signal = options.signal;
    try {
      return await doFetch(buildUrl(baseUrl, path, options.query), init);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ApiError({ status: 0, code: NETWORK_ERROR_CODE, title: 'Network error' });
    }
  }

  /** Single-flight: concurrent 401s share one refresh call (the server rotates the token). */
  function refresh(): Promise<AuthSession | null> {
    refreshing ??= withRefreshLock(async () => {
      refreshRejected = false;
      try {
        const response = await send('/auth/refresh', { method: 'POST', auth: false, csrf: true });
        if (!response.ok) {
          // Only a definitive rejection ends the session. 5xx, 429 and similar are transient and
          // must not sign the user out.
          if (response.status === 401 || response.status === 403) {
            session.clearSession();
            refreshRejected = true;
          }
          return null;
        }
        let next: AuthSession;
        try {
          next = parseAuthSession(await readJson(response));
        } catch {
          // A 2xx with an unusable body is a server fault, not proof the session is dead.
          return null;
        }
        session.setSession(next);
        return next;
      } catch {
        // A network failure during refresh does not prove the session is dead.
        return null;
      } finally {
        refreshing = null;
      }
    });
    return refreshing;
  }

  async function request<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    let response = await send(path, options);

    if (response.status === 401 && options.auth !== false) {
      const refreshed = await refresh();
      if (refreshed) {
        response = await send(path, options);
      } else if (refreshRejected) {
        deps.onSessionExpired?.();
      }
    }

    if (!response.ok) throw await toApiError(response);

    const body = await readJson(response);
    return (options.parser ? options.parser.parse(body) : body) as T;
  }

  return { request, refresh };
}

let sessionExpiredHandler: (() => void) | undefined;

/** Registers the app-level reaction to a forced sign-out (set once at bootstrap). */
export function setSessionExpiredHandler(handler: (() => void) | undefined): void {
  sessionExpiredHandler = handler;
}

export const api = createApiClient({ onSessionExpired: () => sessionExpiredHandler?.() });
