import { ProblemSchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../../test/support/app.js';
import { createFakeAuth, fakeHasher } from '../../../test/support/fakes.js';

const PASSWORD = 'correct horse battery staple 42';
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(env: Record<string, string> = {}, logStream?: { write(l: string): void }) {
  const fake = createFakeAuth();
  const verify = vi.fn(fakeHasher.verify);
  app = await buildTestApp({
    env,
    hasher: { hash: fakeHasher.hash, verify },
    authUnitOfWork: fake.unitOfWork,
    authRepositories: fake.repositories,
    ...(logStream && { logStream }),
  });
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: 'jane@example.com', password: PASSWORD, displayName: 'Jane' },
  });
  return { app, fake, verify };
}

const login = (a: FastifyInstance, email: string, password: string, ip = '203.0.113.1') =>
  a.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress: ip,
    payload: { email, password },
  });

describe('login timing equalisation', () => {
  it('runs one password verification for an unknown email, like for a known one', async () => {
    const { app, verify } = await build();
    verify.mockClear();
    await login(app, 'nobody@example.com', 'whatever password 1');
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockClear();
    await login(app, 'jane@example.com', 'whatever password 1');
    expect(verify).toHaveBeenCalledTimes(1);
  });
});

describe('login rate limits', () => {
  it('blocks the 6th attempt per IP and email within a minute with Retry-After', async () => {
    const { app } = await build({ RATE_LIMIT_ENABLED: 'true' });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++)
      codes.push((await login(app, 'jane@example.com', 'bad pw 12345')).statusCode);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
    const blocked = await login(app, 'jane@example.com', PASSWORD);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['ratelimit-limit']).toBe('5');
    expect(ProblemSchema.parse(blocked.json()).code).toBe('RATE_LIMITED');
    expect(blocked.headers['set-cookie']).toBeUndefined();
  });

  it('does not let one email lockout block other emails from another IP', async () => {
    const { app } = await build({ RATE_LIMIT_ENABLED: 'true' });
    for (let i = 0; i < 6; i++) await login(app, 'jane@example.com', 'bad pw 12345');
    const other = await login(app, 'jane@example.com', PASSWORD, '198.51.100.9');
    expect(other.statusCode).toBe(200);
  });

  it('caps one IP at 20 attempts per minute across emails', async () => {
    const { app } = await build({ RATE_LIMIT_ENABLED: 'true' });
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      codes.push((await login(app, `user${i}@example.com`, 'bad pw 12345')).statusCode);
    }
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(codes[20]).toBe(429);
  });
});

describe('logging', () => {
  it('never writes passwords, access tokens, refresh cookies or emails to the logs', async () => {
    const lines: string[] = [];
    const { app } = await build({ LOG_LEVEL: 'debug' }, { write: (l) => lines.push(l) });
    const bad = await login(app, 'jane@example.com', 'a wrong password 99');
    expect(bad.statusCode).toBe(401);
    const ok = await login(app, 'jane@example.com', PASSWORD);
    const logged = lines.join('\n');
    expect(logged).toContain('auth.login_succeeded');
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain('a wrong password 99');
    expect(logged).not.toContain(ok.json().accessToken);
    expect(logged).not.toContain(String(ok.headers['set-cookie']).split(';')[0]?.split('=')[1]);
    expect(logged).not.toContain('jane@example.com');
  });
});
