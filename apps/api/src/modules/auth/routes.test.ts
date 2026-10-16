import { AuthSessionSchema, ProblemSchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../test/support/app.js';
import { createFakeAuth, fakeHasher } from '../../../test/support/fakes.js';

const URL = '/api/v1/auth/register';
const valid = {
  email: 'Jane.Doe@Example.com',
  password: 'correct horse battery staple 42',
  displayName: 'Jane Doe',
};
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
async function build(env: Record<string, string> = {}, logStream?: { write(l: string): void }) {
  const fake = createFakeAuth();
  app = await buildTestApp({
    env,
    hasher: fakeHasher,
    authUnitOfWork: fake.unitOfWork,
    ...(logStream && { logStream }),
  });
  return {
    app,
    fake,
  };
}
describe('POST /api/v1/auth/register', () => {
  it('returns 201 with an AuthSession, the refresh cookie and no-store', async () => {
    const { app } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: valid,
    });
    expect(res.statusCode).toBe(201);
    const session = AuthSessionSchema.parse(res.json());
    expect(session.user).toMatchObject({
      email: 'jane.doe@example.com',
      role: 'user',
      preferences: {
        currency: 'USD',
        locale: 'en-US',
        timezone: 'UTC',
        theme: 'system',
      },
    });
    expect(res.body).not.toMatch(/password/i);
    expect(res.headers['cache-control']).toBe('no-store');
    const [pair, ...attributes] = String(res.headers['set-cookie']).split('; ');
    expect(pair?.startsWith('midas_rt=')).toBe(true);
    expect(pair?.slice('midas_rt='.length)).toHaveLength(43);
    expect(attributes).toEqual([
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/api/v1/auth',
      'Max-Age=2592000',
    ]);
  });
  it('accepts optional preferences', async () => {
    const { app } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: {
        ...valid,
        currency: 'EUR',
        locale: 'de-DE',
        timezone: 'Europe/Berlin',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.preferences).toMatchObject({
      currency: 'EUR',
      locale: 'de-DE',
    });
  });
  it('returns 409 EMAIL_TAKEN for a duplicate, ignoring case', async () => {
    const { app } = await build();
    await app.inject({
      method: 'POST',
      url: URL,
      payload: valid,
    });
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: {
        ...valid,
        email: 'JANE.DOE@example.COM',
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemSchema.parse(res.json());
    expect(problem.code).toBe('EMAIL_TAKEN');
    expect(problem.errors?.[0]).toMatchObject({
      field: 'email',
      code: 'EMAIL_TAKEN',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });
  it('returns 400 WEAK_PASSWORD for a guessable password', async () => {
    const { app, fake } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: {
        ...valid,
        password: 'password1234',
      },
    });
    expect(res.statusCode).toBe(400);
    const problem = ProblemSchema.parse(res.json());
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.errors).toEqual([
      expect.objectContaining({
        field: 'password',
        code: 'WEAK_PASSWORD',
      }),
    ]);
    expect(fake.users).toHaveLength(0);
  });
  it.each([
    ['short password', { password: 'short' }, 'password', 'TOO_SHORT'],
    ['overlong password', { password: 'a'.repeat(129) }, 'password', 'TOO_LONG'],
    ['invalid email', { email: 'nope' }, 'email', 'INVALID_FORMAT'],
    ['empty display name', { displayName: '  ' }, 'displayName', 'TOO_SHORT'],
    ['unsupported currency', { currency: 'XXX' }, 'currency', 'INVALID_VALUE'],
    ['unknown field', { role: 'admin' }, 'role', 'UNKNOWN_FIELD'],
  ])('rejects %s with 400', async (_name, patch, field, code) => {
    const { app, fake } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: {
        ...valid,
        ...patch,
      },
    });
    expect(res.statusCode).toBe(400);
    const problem = ProblemSchema.parse(res.json());
    expect(problem.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field,
          code,
        }),
      ]),
    );
    expect(fake.users).toHaveLength(0);
  });
  it('reports missing required fields', async () => {
    const { app } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const fields = ProblemSchema.parse(res.json()).errors?.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'displayName']));
  });
  it('rejects a non-JSON content type', async () => {
    const { app } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'text/plain' },
      payload: 'email=a',
    });
    expect(res.statusCode).toBe(400);
    expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
  });
  it('rate limits per IP with 429, Retry-After and RateLimit headers', async () => {
    const { app } = await build({ RATE_LIMIT_REGISTER_MAX: '2' });
    const send = (email: string, remoteAddress = '198.51.100.7') =>
      app.inject({
        method: 'POST',
        url: URL,
        remoteAddress,
        payload: {
          ...valid,
          email,
        },
      });
    const first = await send('a@example.com');
    expect(first.statusCode).toBe(201);
    expect(first.headers['ratelimit-limit']).toBe('2');
    expect(first.headers['ratelimit-remaining']).toBe('1');
    expect((await send('b@example.com')).statusCode).toBe(201);
    const limited = await send('c@example.com');
    expect(limited.statusCode).toBe(429);
    expect(ProblemSchema.parse(limited.json()).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['ratelimit-reset']).toBeDefined();
    // A different client IP has its own budget.
    expect((await send('d@example.com', '198.51.100.8')).statusCode).toBe(201);
  });
  it('ignores X-Forwarded-For unless TRUST_PROXY is set (no limit bypass by spoofing)', async () => {
    const { app } = await build({ RATE_LIMIT_REGISTER_MAX: '1' });
    const send = (email: string, xff: string) =>
      app.inject({
        method: 'POST',
        url: URL,
        headers: { 'x-forwarded-for': xff },
        payload: {
          ...valid,
          email,
        },
      });
    expect((await send('a@example.com', '192.0.2.1')).statusCode).toBe(201);
    expect((await send('b@example.com', '192.0.2.2')).statusCode).toBe(429);
  });
  it('uses the forwarded client IP when one proxy hop is trusted', async () => {
    const { app } = await build({
      RATE_LIMIT_REGISTER_MAX: '1',
      TRUST_PROXY: '1',
    });
    const send = (email: string, xff: string) =>
      app.inject({
        method: 'POST',
        url: URL,
        headers: { 'x-forwarded-for': xff },
        payload: {
          ...valid,
          email,
        },
      });
    expect((await send('a@example.com', '192.0.2.1')).statusCode).toBe(201);
    expect((await send('b@example.com', '192.0.2.2')).statusCode).toBe(201);
    expect((await send('c@example.com', '192.0.2.2')).statusCode).toBe(429);
  });
  it('counts invalid attempts against the limit too', async () => {
    const { app } = await build({ RATE_LIMIT_REGISTER_MAX: '1' });
    const bad = await app.inject({
      method: 'POST',
      url: URL,
      payload: {},
    });
    expect(bad.statusCode).toBe(400);
    const next = await app.inject({
      method: 'POST',
      url: URL,
      payload: valid,
    });
    expect(next.statusCode).toBe(429);
  });
  it('can disable rate limiting through RATE_LIMIT_ENABLED', async () => {
    const { app } = await build({
      RATE_LIMIT_REGISTER_MAX: '1',
      RATE_LIMIT_ENABLED: 'false',
    });
    const a = await app.inject({
      method: 'POST',
      url: URL,
      payload: valid,
    });
    const b = await app.inject({
      method: 'POST',
      url: URL,
      payload: {
        ...valid,
        email: 'x@example.com',
      },
    });
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
  });
  it('logs with the request id and never logs passwords, tokens or cookies', async () => {
    const lines: string[] = [];
    const { app } = await build(
      { LOG_LEVEL: 'info' },
      { write: (line: string) => void lines.push(line) },
    );
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: {
        'x-request-id': 'trace-reg-12345',
        cookie: 'midas_rt=sekrit-cookie',
      },
      payload: valid,
    });
    const setCookie = String(res.headers['set-cookie']);
    const refreshToken = setCookie.slice('midas_rt='.length, setCookie.indexOf(';'));
    const logs = lines.join('');
    expect(logs).toContain('trace-reg-12345');
    expect(logs).toContain('user registered');
    expect(logs).not.toContain(valid.password);
    expect(logs).not.toContain(res.json().accessToken);
    expect(logs).not.toContain(refreshToken);
    expect(logs).not.toContain('sekrit-cookie');
    expect(logs).not.toContain('jane.doe@example.com');
  });
});

describe('POST /api/v1/auth/register display name and error logging', () => {
  it.each(['Jane\u0000Doe', 'Jane\u202EDoe'])(
    'rejects control/bidi characters in displayName with 400 (%#)',
    async (displayName) => {
      const { app, fake } = await build();
      const res = await app.inject({
        method: 'POST',
        url: URL,
        payload: { ...valid, displayName },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(fake.users).toHaveLength(0);
    },
  );

  it('never logs pg error detail (row data such as a password hash)', async () => {
    const lines: string[] = [];
    const { app, fake } = await build({ LOG_LEVEL: 'info' }, { write: (l) => void lines.push(l) });
    fake.failNextSessionInsert(
      Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
        constraint: 'uq_sessions__current_hash',
        table: 'sessions',
        detail: 'Key (hash)=($argon2id$v=19$m=19456,t=2,p=1$secretsalt$secrethash) already exists.',
        where: 'SQL statement with $argon2id$ value',
        internalQuery: 'INSERT ... $argon2id$',
      }),
    );
    const res = await app.inject({ method: 'POST', url: URL, payload: valid });
    expect(res.statusCode).toBe(500);
    const logs = lines.join('');
    expect(logs).toContain('uq_sessions__current_hash');
    expect(logs).toContain('23505');
    expect(logs).not.toContain('argon2id');
    expect(logs).not.toContain('secrethash');
  });
});
