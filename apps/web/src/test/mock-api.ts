import { vi } from 'vitest';

export interface MockRequest {
  method: string;
  path: string;
  /** Path without the /api/v1 prefix and without the query string. */
  params: URLSearchParams;
  body: unknown;
  headers: Headers;
}

export type MockResult =
  Response | { status: number; body?: unknown; headers?: Record<string, string> };
export type MockHandler = (request: MockRequest) => MockResult | Promise<MockResult>;

export interface MockCall extends MockRequest {
  url: string;
}

type RouteKey = `${'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} ${string}`;
export type MockRoutes = Partial<Record<RouteKey, MockHandler | MockResult>>;

export const ok = (body: unknown, status = 200): MockResult => ({ status, body });
export const noContent = (): MockResult => ({ status: 204 });

export function problem(
  status: number,
  code: string,
  options: {
    errors?: Array<{ field: string; code: string; message: string }>;
    detail?: string;
    headers?: Record<string, string>;
  } = {},
): MockResult {
  return {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...options.headers },
    body: {
      type: `https://midas.app/problems/${code.toLowerCase()}`,
      title: code,
      status,
      detail: options.detail ?? 'Request failed.',
      instance: '/api/v1/test',
      code,
      requestId: 'req-test-0001',
      ...(options.errors ? { errors: options.errors } : {}),
    },
  };
}

function toResponse(result: MockResult): Response {
  if (result instanceof Response) return result;
  const hasBody = result.body !== undefined && result.status !== 204;
  return new Response(hasBody ? JSON.stringify(result.body) : null, {
    status: result.status,
    headers: { 'Content-Type': 'application/json', ...result.headers },
  });
}

/**
 * Stubs global fetch with route handlers keyed "METHOD /path" (without /api/v1 or the query).
 * Unmatched requests answer 404 so a missing handler fails loudly in the assertion that needs it.
 */
export function mockApi(routes: MockRoutes) {
  const calls: MockCall[] = [];
  const table = new Map<string, MockHandler | MockResult>();
  for (const [key, entry] of Object.entries(routes)) if (entry) table.set(key, entry);

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    let body: unknown;
    if (typeof init?.body === 'string' && init.body) body = JSON.parse(init.body);
    const request: MockRequest = { method, path, params: url.searchParams, body, headers };
    calls.push({ ...request, url: String(input) });
    const entry = table.get(`${method} ${path}`);
    if (entry === undefined) return toResponse(problem(404, 'NOT_FOUND'));
    const result = typeof entry === 'function' ? await entry(request) : entry;
    return toResponse(result);
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    calls,
    /** Calls made to "METHOD /path". */
    callsTo: (key: RouteKey) => calls.filter((call) => `${call.method} ${call.path}` === key),
    /** Replace or add a handler mid-test. */
    set: (key: RouteKey, handler: MockHandler | MockResult) => {
      table.set(key, handler);
    },
  };
}
