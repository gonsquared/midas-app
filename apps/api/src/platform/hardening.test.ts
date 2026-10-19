import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ORIGIN } from '../../test/support/api.js';
import { buildTestApp } from '../../test/support/app.js';
import { createFakeAuth, fakeHasher } from '../../test/support/fakes.js';

/** Sprint 4 hardening: E10-F1-S1 (429 hints), E10-F1-S2 (headers, CORS), E10-F3-S1 (logs). */
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(env: Record<string, string> = {}, logStream?: { write(l: string): void }) {
  const fake = createFakeAuth();
  app = await buildTestApp({
    env: { RATE_LIMIT_ENABLED: 'true', APP_BASE_URL: APP_ORIGIN, ...env },
    hasher: fakeHasher,
    authUnitOfWork: fake.unitOfWork,
    authRepositories: fake.repositories,
    ...(logStream && { logStream }),
  });
  return app;
}

describe('E10-F1-S1: 429 responses carry retry hints on login, register and reset', () => {
  const cases: Array<{
    name: string;
    url: string;
    env: Record<string, string>;
    payload: object;
    window: number;
  }> = [
    {
      name: 'login',
      url: '/api/v1/auth/login',
      env: { RATE_LIMIT_LOGIN_IP_MAX: '1' },
      payload: { email: 'a@example.com', password: 'bad pw 12345' },
      window: 60,
    },
    {
      name: 'register',
      url: '/api/v1/auth/register',
      env: { RATE_LIMIT_REGISTER_MAX: '1', RATE_LIMIT_REGISTER_WINDOW_SECONDS: '120' },
      payload: {},
      window: 120,
    },
    {
      name: 'password reset',
      url: '/api/v1/auth/password/reset',
      env: { RATE_LIMIT_RESET_MAX: '1' },
      payload: {},
      window: 3600,
    },
    {
      name: 'forgot password',
      url: '/api/v1/auth/password/forgot',
      env: { RATE_LIMIT_FORGOT_IP_MAX: '1' },
      payload: { email: 'a@example.com' },
      window: 3600,
    },
  ];

  it.each(cases)('$name: Retry-After and RateLimit headers agree', async (c) => {
    const a = await build(c.env);
    const send = () =>
      a.inject({ method: 'POST', url: c.url, remoteAddress: '203.0.113.50', payload: c.payload });
    expect((await send()).statusCode).not.toBe(429);
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
    const retryAfter = Number(limited.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(c.window);
    expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    expect(limited.headers['ratelimit-reset']).toBe(String(retryAfter));
    // Nothing about the key (IP, email) leaks into the body.
    expect(limited.body).not.toMatch(/203\.0\.113\.50|a@example\.com/);
  });

  it('limits are tunable: a larger maximum admits more attempts before the 429', async () => {
    const a = await build({ RATE_LIMIT_LOGIN_IP_MAX: '4', RATE_LIMIT_LOGIN_MAX: '4' });
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await a.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: '203.0.113.51',
        payload: { email: 'a@example.com', password: 'bad pw 12345' },
      });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 401, 429]);
  });
});

describe('E10-F1-S2: security headers on every kind of response', () => {
  const EXPECTED_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  it.each([
    ['a 404', 'GET', '/api/v1/nope'],
    ['a 401', 'GET', '/api/v1/wallets'],
    ['a health response', 'GET', '/health'],
    ['a 400 from a public route', 'POST', '/api/v1/auth/login'],
    ['the metrics endpoint', 'GET', '/metrics'],
  ])('sets CSP, framing, nosniff and referrer headers on %s', async (_label, method, url) => {
    const a = await build();
    const res = await a.inject({
      method: method as 'GET',
      url,
      ...(method === 'POST' && { payload: {} }),
    });
    const csp = String(res.headers['content-security-policy']);
    for (const directive of EXPECTED_CSP) expect(csp).toContain(directive);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['server']).toBeUndefined();
  });

  it('sends HSTS with includeSubDomains in production, on errors too', async () => {
    const a = await build({ NODE_ENV: 'production', APP_BASE_URL: 'https://midas.example.com' });
    const res = await a.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+; includeSubDomains/);
  });

  it('marks API responses no-store', async () => {
    const a = await build();
    const res = await a.inject({ method: 'GET', url: '/api/v1/wallets' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('E10-F1-S2: CORS restricted by config', () => {
  const ORIGIN = 'http://localhost:5173';

  it('refuses preflights that ask for a method or header outside the allowlist', async () => {
    const a = await build({ CORS_ORIGINS: ORIGIN });
    const res = await a.inject({
      method: 'OPTIONS',
      url: '/api/v1/wallets',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'x-evil',
      },
    });
    const methods = String(res.headers['access-control-allow-methods']);
    const headers = String(res.headers['access-control-allow-headers']).toLowerCase();
    expect(methods.split(',').map((m) => m.trim())).not.toContain('PUT');
    expect(headers).not.toContain('x-evil');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('exposes only the documented response headers to the allowed origin', async () => {
    const a = await build({ CORS_ORIGINS: ORIGIN });
    const res = await a.inject({ method: 'GET', url: '/health', headers: { origin: ORIGIN } });
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(String(res.headers['access-control-expose-headers'])).toContain('Retry-After');
    expect(String(res.headers['vary'])).toContain('Origin');
  });

  it('serves several configured origins individually, never as a list or a wildcard', async () => {
    const a = await build({ CORS_ORIGINS: `${ORIGIN},https://app.example.com` });
    for (const origin of [ORIGIN, 'https://app.example.com']) {
      const res = await a.inject({ method: 'GET', url: '/health', headers: { origin } });
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
    const other = await a.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.example.com.evil.test' },
    });
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('E10-F3-S1: request logs carry correlation ids', () => {
  interface Line {
    msg?: string;
    requestId?: string;
    serverRequestId?: string;
    level?: number;
    res?: { statusCode?: number };
  }
  function capture() {
    const lines: Line[] = [];
    return {
      lines,
      stream: {
        write(raw: string) {
          lines.push(JSON.parse(raw) as Line);
        },
      },
    };
  }
  const completed = (lines: Line[]) => lines.filter((l) => l.msg === 'request completed');

  it('logs the response X-Request-Id on the completion line and a separate server id', async () => {
    const log = capture();
    const a = await build({ LOG_LEVEL: 'info' }, log.stream);
    const res = await a.inject({
      method: 'GET',
      url: '/api/v1/nope',
      headers: { 'x-request-id': 'client-id-12345' },
    });
    expect(res.headers['x-request-id']).toBe('client-id-12345');
    const line = completed(log.lines).at(-1);
    expect(line?.requestId).toBe('client-id-12345');
    expect(line?.res?.statusCode).toBe(404);
    expect(line?.serverRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(line?.serverRequestId).not.toBe(line?.requestId);
  });

  it('generates an id when the inbound one is malformed and logs the generated one', async () => {
    const log = capture();
    const a = await build({ LOG_LEVEL: 'info' }, log.stream);
    const res = await a.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'bad id; drop table x' },
    });
    const id = String(res.headers['x-request-id']);
    expect(id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(completed(log.lines).at(-1)?.requestId).toBe(id);
    expect(log.lines.map((l) => JSON.stringify(l)).join('')).not.toContain('drop table');
  });

  it('correlates the error log of a failure with the id returned to the client', async () => {
    const log = capture();
    const fake = createFakeAuth();
    app = await buildTestApp({
      env: { LOG_LEVEL: 'info' },
      logStream: log.stream,
      authRepositories: fake.repositories,
      authUnitOfWork: async () => {
        throw new Error('boom internal detail');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'u@example.com',
        password: 'correct horse battery staple 42',
        displayName: 'U',
      },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json<{ requestId: string }>();
    expect(body.requestId).toBe(res.headers['x-request-id']);
    const error = log.lines.find((l) => l.level === 50);
    expect(error?.requestId).toBe(body.requestId);
    expect(res.body).not.toContain('boom');
  });

  it('never writes credentials to the request log', async () => {
    const log = capture();
    const a = await build({ LOG_LEVEL: 'info' }, log.stream);
    await a.inject({
      method: 'GET',
      url: '/api/v1/wallets?q=secret-search',
      headers: {
        authorization: 'Bearer very.secret.token',
        cookie: 'midas_rt=sekret-cookie-value',
      },
    });
    const text = log.lines.map((l) => JSON.stringify(l)).join('\n');
    expect(text).not.toMatch(/very\.secret\.token|sekret-cookie-value|secret-search/);
  });
});
