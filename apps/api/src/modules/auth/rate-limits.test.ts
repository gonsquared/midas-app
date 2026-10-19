import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ORIGIN, refreshHeaders } from '../../../test/support/api.js';
import { buildTestApp } from '../../../test/support/app.js';
import { createFakeAuth, fakeHasher } from '../../../test/support/fakes.js';

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
  return { app, fake };
}

const login = (a: FastifyInstance, email: string, remoteAddress: string) =>
  a.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress,
    payload: { email, password: 'bad pw 12345' },
  });

const forgot = (a: FastifyInstance, email: string, remoteAddress: string) =>
  a.inject({
    method: 'POST',
    url: '/api/v1/auth/password/forgot',
    remoteAddress,
    payload: { email },
  });

describe('IPv6 rate-limit keys', () => {
  it('shares one login counter across addresses in the same /64', async () => {
    const { app } = await build({ RATE_LIMIT_LOGIN_IP_MAX: '3' });
    const sameNetwork = [
      '2001:db8:aa:bb::1',
      '2001:db8:aa:bb:1234:5678:9abc:def0',
      '2001:db8:aa:bb::ffff',
    ];
    const codes: number[] = [];
    for (const [i, address] of sameNetwork.entries()) {
      codes.push((await login(app, `u${i}@example.com`, address)).statusCode);
    }
    expect(codes).toEqual([401, 401, 401]);
    expect((await login(app, 'u9@example.com', '2001:db8:aa:bb:9::9')).statusCode).toBe(429);
    // A neighbouring /64 and an IPv4 client are unaffected.
    expect((await login(app, 'u9@example.com', '2001:db8:aa:cc::1')).statusCode).toBe(401);
    expect((await login(app, 'u9@example.com', '198.51.100.7')).statusCode).toBe(401);
  });

  it('applies the global per-IP ceiling per /64 as well', async () => {
    const { app } = await build({ RATE_LIMIT_GLOBAL_IP_MAX: '2' });
    const get = (ip: string) => app.inject({ method: 'GET', url: '/api/v1/me', remoteAddress: ip });
    expect((await get('2001:db8:1:1::1')).statusCode).toBe(401);
    expect((await get('2001:db8:1:1::2')).statusCode).toBe(401);
    expect((await get('2001:db8:1:1::3')).statusCode).toBe(429);
  });
});

describe('per-account limits', () => {
  it('caps logins per account across many IPs', async () => {
    const { app } = await build({
      RATE_LIMIT_LOGIN_ACCOUNT_MAX: '4',
      RATE_LIMIT_LOGIN_MAX: '100',
      RATE_LIMIT_LOGIN_IP_MAX: '100',
    });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await login(app, 'victim@example.com', `198.51.100.${i + 1}`)).statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 401, 429, 429]);
    // Other accounts are not affected.
    expect((await login(app, 'other@example.com', '198.51.100.50')).statusCode).toBe(401);
  });

  it('keeps the per-email forgot cap while an attacker churns through other keys', async () => {
    const { app } = await build({
      RATE_LIMIT_FORGOT_IP_MAX: '100000',
      RATE_LIMIT_GLOBAL_IP_MAX: '1000000',
    });
    const victim = 'victim@example.com';
    for (let i = 0; i < 3; i++) {
      expect((await forgot(app, victim, '203.0.113.1')).statusCode).toBe(202);
    }
    // More distinct keys than the former 5000-entry store could hold.
    for (let i = 0; i < 5_500; i++) await forgot(app, `churn${i}@example.com`, '203.0.113.2');
    expect((await forgot(app, victim, '203.0.113.3')).statusCode).toBe(429);
  }, 60_000);

  it('does not let key churn in one limiter family evict another family counters', async () => {
    const { app } = await build({
      RATE_LIMIT_STORE_MAX_KEYS: '50',
      RATE_LIMIT_LOGIN_ACCOUNT_MAX: '100',
      RATE_LIMIT_FORGOT_IP_MAX: '100000',
      RATE_LIMIT_GLOBAL_IP_MAX: '1000000',
    });
    const victim = 'victim@example.com';
    for (let i = 0; i < 3; i++) await forgot(app, victim, '203.0.113.1');
    // Flood the login limiters (separate stores) with far more keys than their capacity.
    for (let i = 0; i < 200; i++) {
      await login(app, `x${i}@example.com`, `198.51.100.${(i % 200) + 1}`);
    }
    expect((await forgot(app, victim, '203.0.113.3')).statusCode).toBe(429);
  });
});

describe('refresh rate limit', () => {
  const token = (sid: string) => `${sid}.${'A'.repeat(43)}`;
  const SID_A = '0199c6a8-0000-7000-8000-00000000000a';
  const SID_B = '0199c6a8-0000-7000-8000-00000000000b';
  const refresh = (a: FastifyInstance, cookieToken: string | undefined, remoteAddress: string) =>
    a.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      remoteAddress,
      headers:
        cookieToken === undefined
          ? { origin: APP_ORIGIN, 'x-csrf-protection': '1' }
          : refreshHeaders(cookieToken),
    });

  it('counts per session, whatever the IP, and does not touch other sessions', async () => {
    const { app } = await build({ RATE_LIMIT_REFRESH_MAX: '2' });
    expect((await refresh(app, token(SID_A), '198.51.100.1')).statusCode).toBe(401);
    expect((await refresh(app, token(SID_A), '198.51.100.2')).statusCode).toBe(401);
    expect((await refresh(app, token(SID_A), '198.51.100.3')).statusCode).toBe(429);
    // Another session from the same IP as a blocked request still gets through.
    expect((await refresh(app, token(SID_B), '198.51.100.3')).statusCode).toBe(401);
  });

  it('falls back to the IP when the cookie is missing or malformed', async () => {
    const { app } = await build({ RATE_LIMIT_REFRESH_MAX: '2' });
    expect((await refresh(app, undefined, '198.51.100.9')).statusCode).toBe(401);
    expect((await refresh(app, 'garbage', '198.51.100.9')).statusCode).toBe(401);
    expect((await refresh(app, undefined, '198.51.100.9')).statusCode).toBe(429);
    expect((await refresh(app, undefined, '198.51.100.10')).statusCode).toBe(401);
  });

  it('caps rotating forged session ids per IP and sends Retry-After', async () => {
    const { app } = await build({ RATE_LIMIT_REFRESH_MAX: '2', RATE_LIMIT_REFRESH_IP_MAX: '5' });
    const sid = (i: number) => `0199c6a8-0000-7000-8000-${String(i).padStart(12, '0')}`;
    for (let i = 0; i < 5; i++) {
      expect((await refresh(app, token(sid(i)), '198.51.100.20')).statusCode).toBe(401);
    }
    const limited = await refresh(app, token(sid(99)), '198.51.100.20');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect((await refresh(app, token(sid(100)), '198.51.100.21')).statusCode).toBe(401);
  });
});

describe('API detection does not depend on the raw URL', () => {
  it.each(['/%61pi/v1/wallets', '/api/v1/wallets', '/%41pi/v1/nothing', '/api/%76%31/wallets'])(
    'applies the global limit and no-store to %s',
    async (url) => {
      const { app } = await build({ RATE_LIMIT_GLOBAL_IP_MAX: '2' });
      const first = await app.inject({ method: 'GET', url });
      expect(first.headers['cache-control']).toBe('no-store');
      await app.inject({ method: 'GET', url });
      const third = await app.inject({ method: 'GET', url });
      expect(third.statusCode).toBe(429);
      expect(third.headers['cache-control']).toBe('no-store');
    },
  );

  it('leaves non-API routes such as /health out of the API limiter', async () => {
    const { app } = await build({ RATE_LIMIT_GLOBAL_IP_MAX: '1' });
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).not.toBe(429);
    }
  });
});

describe('request logging', () => {
  it('does not log query values such as the search term q', async () => {
    const lines: string[] = [];
    const { app } = await build(
      { LOG_LEVEL: 'info', RATE_LIMIT_ENABLED: 'false' },
      { write: (l) => lines.push(l) },
    );
    await app.inject({ method: 'GET', url: '/api/v1/transactions?q=secret-salary-acme&limit=5' });
    const logged = lines.join('\n');
    expect(logged).toContain('/api/v1/transactions?q=[redacted]');
    expect(logged).not.toContain('secret-salary-acme');
  });
});
