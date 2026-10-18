import type { AuthSession } from '@midas/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  buildUrl,
  createApiClient,
  getErrorMessage,
  type ApiClientDeps,
} from './api-client';
import type { SessionStore } from './session';

const USER_ID = '3f2b8c1e-9d44-4a55-8f0c-0a1b2c3d4e5f';

function makeSession(token: string): AuthSession {
  return {
    accessToken: token,
    accessTokenExpiresAt: '2026-10-16T12:15:00.000Z',
    user: {
      id: USER_ID,
      email: 'kim@example.com',
      displayName: 'Kim',
      role: 'user',
      status: 'active',
      preferences: { currency: 'USD', locale: 'en-US', timezone: 'UTC', theme: 'system' },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
  };
}

function memoryStore(initial: string | null = null): SessionStore & { token: () => string | null } {
  let token = initial;
  return {
    getAccessToken: () => token,
    setSession: (s) => {
      token = s.accessToken;
    },
    clearSession: () => {
      token = null;
    },
    token: () => token,
  };
}

const json = (status: number, body: unknown, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });

const problem = (status: number, code: string, detail = 'Detail text') =>
  json(
    status,
    {
      type: `https://midas.app/problems/${code.toLowerCase()}`,
      title: 'Problem',
      status,
      detail,
      instance: '/api/v1/x',
      code,
      requestId: 'req-12345678',
      errors: [{ field: 'email', code: 'INVALID', message: 'Bad email' }],
    },
    'application/problem+json',
  );

function setup(responses: Array<Response | Error>, token: string | null = 'tok-1') {
  const fetchMock = vi.fn<typeof fetch>();
  for (const r of responses) {
    if (r instanceof Error) fetchMock.mockRejectedValueOnce(r);
    else fetchMock.mockResolvedValueOnce(r);
  }
  const session = memoryStore(token);
  const onSessionExpired = vi.fn();
  const deps: ApiClientDeps = { fetch: fetchMock, session, onSessionExpired };
  return { client: createApiClient(deps), fetchMock, session, onSessionExpired };
}

const headersOf = (call: unknown[]) => new Headers((call[1] as RequestInit).headers);

describe('api client', () => {
  it('attaches the bearer token, same-origin credentials and query params', async () => {
    const { client, fetchMock } = setup([json(200, { ok: true })]);
    await client.request('/wallets', { query: { archived: true, q: undefined, page: 2 } });
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/wallets?archived=true&page=2');
    expect(headersOf(call).get('Authorization')).toBe('Bearer tok-1');
    expect((call[1] as RequestInit).credentials).toBe('same-origin');
  });

  it('maps RFC 9457 problems to ApiError with code, request id and field errors', async () => {
    const { client } = setup([problem(409, 'EMAIL_TAKEN', 'That email cannot be used.')], null);
    const error = await client.request('/x', { auth: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe('EMAIL_TAKEN');
    expect(apiError.requestId).toBe('req-12345678');
    expect(apiError.fieldErrors[0]?.field).toBe('email');
    expect(getErrorMessage(apiError)).toBe('That email cannot be used.');
  });

  it('never shows raw server text or stack traces for 5xx', async () => {
    const { client } = setup([problem(500, 'INTERNAL_ERROR', 'at handler /srv/api.js:1')]);
    const error = await client.request('/x').catch((e: unknown) => e);
    expect(getErrorMessage(error)).not.toContain('/srv');
    expect(getErrorMessage(error)).toMatch(/our side/);
  });

  it('handles non-problem error bodies and network failures', async () => {
    const { client } = setup([new Response('oops, a proxy page', { status: 502 })]);
    const bad = (await client.request('/x').catch((e: unknown) => e)) as ApiError;
    expect(bad.status).toBe(502);
    expect(bad.code).toBe('INTERNAL_ERROR');

    const offline = setup([new TypeError('Failed to fetch')]);
    const net = (await offline.client.request('/x').catch((e: unknown) => e)) as ApiError;
    expect(net.code).toBe('NETWORK_ERROR');
    expect(getErrorMessage(net)).toMatch(/cannot be reached/);
  });
});

describe('api client refresh', () => {
  it('refreshes once on 401 (CSRF header, no bearer) and retries with the new token', async () => {
    const { client, fetchMock, session } = setup([
      problem(401, 'UNAUTHENTICATED'),
      json(200, makeSession('tok-2')),
      json(200, { done: true }),
    ]);
    await expect(client.request('/wallets')).resolves.toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshCall = fetchMock.mock.calls[1]!;
    expect(refreshCall[0]).toBe('/api/v1/auth/refresh');
    expect(headersOf(refreshCall).get('X-CSRF-Protection')).toBe('1');
    expect(headersOf(refreshCall).get('Authorization')).toBeNull();
    expect(headersOf(fetchMock.mock.calls[2]!).get('Authorization')).toBe('Bearer tok-2');
    expect(session.token()).toBe('tok-2');
  });

  it('shares one refresh call between concurrent 401s (single-flight)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return json(200, makeSession('tok-2'));
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer tok-2' ? json(200, { ok: 1 }) : problem(401, 'UNAUTHENTICATED');
    });
    const client = createApiClient({ fetch: fetchMock, session: memoryStore('old') });
    await Promise.all([client.request('/a'), client.request('/b'), client.request('/c')]);
    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears the session and signals expiry when refresh fails', async () => {
    const { client, session, onSessionExpired } = setup([
      problem(401, 'UNAUTHENTICATED'),
      problem(401, 'SESSION_INVALID'),
    ]);
    const error = (await client.request('/wallets').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(401);
    expect(session.token()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it.each([500, 429, 503])('keeps the session when refresh fails with %i', async (status) => {
    const { client, session, onSessionExpired } = setup([
      problem(401, 'UNAUTHENTICATED'),
      problem(status, 'TRANSIENT'),
    ]);
    await client.request('/wallets').catch(() => 0);
    expect(session.token()).toBe('tok-1');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('keeps the session when refresh fails on the network', async () => {
    const { client, session, onSessionExpired } = setup([
      problem(401, 'UNAUTHENTICATED'),
      new TypeError('offline'),
    ]);
    await client.request('/wallets').catch(() => 0);
    expect(session.token()).toBe('tok-1');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('clears the session on a 403 from refresh', async () => {
    const { client, session, onSessionExpired } = setup([
      problem(401, 'UNAUTHENTICATED'),
      problem(403, 'FORBIDDEN'),
    ]);
    await client.request('/wallets').catch(() => 0);
    expect(session.token()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('does not try to refresh for unauthenticated calls such as login', async () => {
    const { client, fetchMock } = setup([problem(401, 'INVALID_CREDENTIALS')], null);
    await client.request('/auth/login', { method: 'POST', body: {}, auth: false }).catch(() => 0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('api client safety', () => {
  it('validates responses with the supplied parser', async () => {
    const { client } = setup([json(200, { n: 'not a number' })]);
    const parser = {
      parse: (d: unknown) => {
        if (typeof (d as { n: unknown }).n !== 'number') throw new Error('bad shape');
        return d as { n: number };
      },
    };
    await expect(client.request('/x', { parser })).rejects.toThrow('bad shape');
  });

  it('rejects absolute or protocol-relative paths', async () => {
    const { client, fetchMock } = setup([]);
    await expect(client.request('//evil.example/x')).rejects.toThrow();
    await expect(client.request('https://evil.example/x')).rejects.toThrow();
    await expect(client.request('wallets')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects dot segments, query and fragment characters in the path', async () => {
    const { client, fetchMock } = setup([]);
    for (const path of ['/transactions/../wallets', '/transactions/.', '/a/x?y=1', '/a/x#frag']) {
      await expect(client.request(path)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts an encoded id as a single segment', () => {
    expect(buildUrl('/api/v1', `/transactions/${encodeURIComponent('a/b?c')}`, undefined)).toBe(
      '/api/v1/transactions/a%2Fb%3Fc',
    );
  });
});

describe('api client cross-tab refresh', () => {
  it('serialises the refresh call with a Web Lock when the browser has one', async () => {
    const events: string[] = [];
    const request = vi.fn(async (name: string, callback: () => Promise<unknown>) => {
      events.push(`lock:${name}`);
      const result = await callback();
      events.push('unlock');
      return result;
    });
    vi.stubGlobal('navigator', { ...globalThis.navigator, locks: { request } });
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        events.push('refresh');
        return json(200, makeSession('tok-2'));
      }
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer tok-2' ? json(200, { ok: 1 }) : problem(401, 'UNAUTHENTICATED');
    });
    const client = createApiClient({ fetch: fetchMock, session: memoryStore('old') });
    await client.request('/a');
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0]).toBe('midas-session-refresh');
    expect(events).toEqual(['lock:midas-session-refresh', 'refresh', 'unlock']);
  });
});

describe('api client query strings', () => {
  it('sends arrays as repeated keys and skips undefined', async () => {
    const { client, fetchMock } = setup([json(200, {})]);
    await client.request('/transactions', {
      query: { walletId: ['a', 'b'], limit: 25, q: undefined, includeArchived: true },
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      '/api/v1/transactions?walletId=a&walletId=b&limit=25&includeArchived=true',
    );
  });
});

describe('download and parseFilename', () => {
  it('accepts only a plain attachment name', async () => {
    const { parseFilename } = await import('./api-client');
    expect(parseFilename('attachment; filename="midas-transactions-20261016.csv"')).toBe(
      'midas-transactions-20261016.csv',
    );
    expect(parseFilename('attachment; filename="../etc/passwd"')).toBeUndefined();
    expect(parseFilename('attachment; filename=".hidden"')).toBeUndefined();
    expect(parseFilename('attachment; filename="a/b.csv"')).toBeUndefined();
    expect(parseFilename('attachment; filename="x.csv')).toBeUndefined();
    expect(parseFilename('attachment; filename="a b.csv"')).toBeUndefined();
    expect(parseFilename('attachment; filename=plain.csv; size=3')).toBe('plain.csv');
    expect(parseFilename('attachment; filename=plain.csv')).toBe('plain.csv');
    expect(parseFilename(null)).toBeUndefined();
  });

  it('returns the body as a blob with the bearer token and maps errors', async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const doFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get('Authorization') });
      return calls.length === 1
        ? new Response('a,b\n', {
            headers: { 'Content-Disposition': 'attachment; filename="x.csv"' },
          })
        : new Response('{}', { status: 400 });
    }) as typeof fetch;
    const { createApiClient } = await import('./api-client');
    const client = createApiClient({
      fetch: doFetch,
      session: {
        getAccessToken: () => 'tok',
        setSession: () => undefined,
        clearSession: () => undefined,
      },
    });
    const result = await client.download('/transactions/export', { query: { q: 'a' } });
    expect(await result.blob.text()).toBe('a,b\n');
    expect(result.filename).toBe('x.csv');
    expect(calls[0]).toEqual({ url: '/api/v1/transactions/export?q=a', auth: 'Bearer tok' });
    await expect(client.download('/transactions/export')).rejects.toMatchObject({ status: 400 });
  });
});
