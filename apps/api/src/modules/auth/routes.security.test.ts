import { ProblemSchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../test/support/app.js';
import { createFakeAuth, fakeHasher } from '../../../test/support/fakes.js';

const URL = '/api/v1/auth/register';
const valid = {
  email: 'sec.tester@example.com',
  password: 'correct horse battery staple 42',
  displayName: 'Sec Tester',
};
const PROBLEM_KEYS = ['code', 'detail', 'instance', 'requestId', 'status', 'title', 'type'];
const LEAK = /stack|node_modules|\.ts:|at \w+ \(|SELECT|INSERT|syntax error|pg_|postgres|ECONN/i;

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(env: Record<string, string> = {}) {
  const fake = createFakeAuth();
  app = await buildTestApp({ env, hasher: fakeHasher, authUnitOfWork: fake.unitOfWork });
  return { app, fake };
}

describe('register: injection and malformed input', () => {
  it.each([
    "' OR '1'='1",
    "admin'--",
    "a@example.com'; DROP TABLE users;--",
    "x@example.com' UNION SELECT password_hash FROM users--",
  ])('should reject SQL metacharacters in the email field with 400 (%s)', async (email) => {
    const { app, fake } = await build();
    const res = await app.inject({ method: 'POST', url: URL, payload: { ...valid, email } });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toMatch(LEAK);
    expect(fake.users).toHaveLength(0);
  });

  it('should store a SQL payload in displayName as inert text', async () => {
    const { app, fake } = await build();
    const name = "Robert'); DROP TABLE users;--";
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: { ...valid, displayName: name },
    });
    expect(res.statusCode).toBe(201);
    expect(fake.users[0]?.displayName).toBe(name);
  });

  it.each([
    ['array', '[]'],
    ['null', 'null'],
    ['string', '"hello"'],
    ['number', '42'],
  ])('should return 400 for a JSON %s body instead of an object', async (_n, payload) => {
    const { app } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
  });

  it('should return 400 for an empty body with a JSON content type', async () => {
    const { app } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toMatch(LEAK);
  });

  it('should return 400 for a body over the 64 KiB limit without echoing it', async () => {
    const { app, fake } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: { ...valid, displayName: 'A'.repeat(70_000) },
    });
    expect(res.statusCode).toBe(400);
    expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
    expect(res.body.length).toBeLessThan(1000);
    expect(fake.users).toHaveLength(0);
  });

  it.each([
    ['email 255 chars', { email: `${'a'.repeat(243)}@example.com` }, 'email'],
    ['displayName 81 chars', { displayName: 'n'.repeat(81) }, 'displayName'],
    ['password 129 chars', { password: 'p'.repeat(129) }, 'password'],
  ])('should return 400 for %s (beyond declared limit)', async (_n, patch, field) => {
    const { app, fake } = await build();
    const res = await app.inject({ method: 'POST', url: URL, payload: { ...valid, ...patch } });
    expect(res.statusCode).toBe(400);
    expect(ProblemSchema.parse(res.json()).errors?.map((e) => e.field)).toContain(field);
    expect(fake.users).toHaveLength(0);
  });

  it.each([
    ['password as number', { password: 12345678901234 }],
    ['email as array', { email: ['a@example.com'] }],
    ['email as object', { email: { ne: null } }],
    ['displayName as null', { displayName: null }],
    ['currency as number', { currency: 840 }],
  ])('should return 400 for wrong type: %s', async (_n, patch) => {
    const { app, fake } = await build();
    const res = await app.inject({ method: 'POST', url: URL, payload: { ...valid, ...patch } });
    expect(res.statusCode).toBe(400);
    expect(fake.users).toHaveLength(0);
  });
});

describe('register: mass assignment and prototype pollution', () => {
  it.each([
    ['role', { role: 'admin' }],
    ['status', { status: 'active' }],
    ['id', { id: '00000000-0000-7000-8000-000000000000' }],
    ['isAdmin', { isAdmin: true }],
    ['passwordHash', { passwordHash: 'evil-hash' }],
    ['theme', { theme: 'dark' }],
  ])('should reject server-owned field %s with UNKNOWN_FIELD', async (key, extra) => {
    const { app, fake } = await build();
    const res = await app.inject({ method: 'POST', url: URL, payload: { ...valid, ...extra } });
    expect(res.statusCode).toBe(400);
    expect(ProblemSchema.parse(res.json()).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: key, code: 'UNKNOWN_FIELD' })]),
    );
    expect(fake.users).toHaveLength(0);
  });

  it.each([
    '{"email":"p@example.com","password":"correct horse battery staple 42","displayName":"P","__proto__":{"role":"admin"}}',
    '{"email":"p@example.com","password":"correct horse battery staple 42","displayName":"P","constructor":{"prototype":{"role":"admin"}}}',
  ])('should reject prototype pollution payloads and leave Object.prototype clean', async (raw) => {
    const { app, fake } = await build();
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'application/json' },
      payload: raw,
    });
    expect(res.statusCode).toBe(400);
    expect(fake.users).toHaveLength(0);
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'role')).toBe(false);
  });

  it('should always create the account with role user and status active', async () => {
    const { app } = await build();
    const res = await app.inject({ method: 'POST', url: URL, payload: valid });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ role: 'user', status: 'active' });
  });
});

describe('register: error shape does not leak internals', () => {
  it('should return the same minimal Problem shape for 400, 409 and 429', async () => {
    const { app } = await build({ RATE_LIMIT_REGISTER_MAX: '3' });
    const bad = await app.inject({ method: 'POST', url: URL, payload: {} });
    await app.inject({ method: 'POST', url: URL, payload: valid });
    const dup = await app.inject({ method: 'POST', url: URL, payload: valid });
    const limited = await app.inject({ method: 'POST', url: URL, payload: valid });

    expect([bad.statusCode, dup.statusCode, limited.statusCode]).toEqual([400, 409, 429]);
    for (const res of [bad, dup, limited]) {
      expect(res.headers['content-type']).toContain('application/problem+json');
      const keys = Object.keys(res.json()).filter((k) => k !== 'errors');
      expect(keys.sort()).toEqual(PROBLEM_KEYS);
      expect(res.body).not.toMatch(LEAK);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('should not expose the submitted password in any error response', async () => {
    const { app } = await build();
    const password = 'password1234';
    const res = await app.inject({ method: 'POST', url: URL, payload: { ...valid, password } });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain(password);
  });

  it('should not disclose server software on a wrong-method request', async () => {
    const { app } = await build();
    const res = await app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['server']).toBeUndefined();
  });
});
