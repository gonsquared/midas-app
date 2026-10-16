import { createHash } from 'node:crypto';
import { AuthSessionSchema, ProblemSchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { argon2Hasher } from '../../src/modules/auth/password-hasher.js';
import { createAccessTokenService } from '../../src/modules/auth/tokens.js';
import type { DatabaseClient } from '../../src/platform/db/client.js';
import { testConfig, TEST_SECRET } from '../support/app.js';
import { appClient, describeDb, ownerPool, truncateAll } from '../support/db.js';

const URL = '/api/v1/auth/register';
const body = {
  email: 'Jane.Doe@Example.com',
  password: 'correct horse battery staple 42',
  displayName: 'Jane Doe',
  currency: 'EUR',
};

describeDb('POST /api/v1/auth/register (real PostgreSQL, midas_app role)', () => {
  let owner: pg.Pool;
  let client: DatabaseClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    owner = ownerPool();
    client = appClient();
    app = await buildApp({
      config: testConfig({ RATE_LIMIT_ENABLED: 'false' }),
      db: client.db,
      clock: { now: () => new Date() },
    });
  });
  afterAll(async () => {
    await app.close();
    await client.db.destroy();
    await owner.end();
  });
  beforeEach(async () => {
    await truncateAll(owner);
  });

  it('persists an argon2id user and a hashed-token session, and returns a valid AuthSession', async () => {
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'user-agent': 'int-test/1.0' },
      remoteAddress: '203.0.113.5',
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const session = AuthSessionSchema.parse(res.json());
    expect(session.user.email).toBe('jane.doe@example.com');
    expect(session.user.preferences).toEqual({
      currency: 'EUR',
      locale: 'en-US',
      timezone: 'UTC',
      theme: 'system',
    });

    const users = await owner.query('SELECT * FROM users');
    expect(users.rowCount).toBe(1);
    const user = users.rows[0];
    expect(user.id).toBe(session.user.id);
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
    expect(user.password_hash).not.toContain(body.password);
    expect(await argon2Hasher.verify(user.password_hash, body.password)).toBe(true);
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);

    const setCookie = String(res.headers['set-cookie']);
    const refreshToken = setCookie.slice('midas_rt='.length, setCookie.indexOf(';'));
    const sessions = await owner.query('SELECT * FROM sessions');
    expect(sessions.rowCount).toBe(1);
    const row = sessions.rows[0];
    expect(row.user_id).toBe(user.id);
    expect(
      Buffer.from(row.current_refresh_token_hash).equals(
        createHash('sha256').update(refreshToken).digest(),
      ),
    ).toBe(true);
    expect(row.ip).toBe('203.0.113.5');
    expect(row.user_agent).toBe('int-test/1.0');
    expect(row.revoked_at).toBeNull();
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBeGreaterThan(29 * 86_400_000);

    const claims = await createAccessTokenService({
      secret: TEST_SECRET,
      ttlSeconds: 600,
    }).verify(session.accessToken, new Date());
    expect(claims).toEqual({ userId: user.id, sessionId: row.id });
  });

  it('returns 409 for a duplicate email regardless of case and keeps a single user', async () => {
    expect((await app.inject({ method: 'POST', url: URL, payload: body })).statusCode).toBe(201);
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: { ...body, email: 'JANE.DOE@EXAMPLE.COM' },
    });
    expect(res.statusCode).toBe(409);
    const problem = ProblemSchema.parse(res.json());
    expect(problem).toMatchObject({ code: 'EMAIL_TAKEN', status: 409 });
    expect(problem.errors?.[0]?.field).toBe('email');
    expect(res.body).not.toMatch(/uq_users|duplicate key|constraint/i);
    expect((await owner.query('SELECT 1 FROM users')).rowCount).toBe(1);
    expect((await owner.query('SELECT 1 FROM sessions')).rowCount).toBe(1);
  });

  it('lets exactly one of several concurrent registrations for the same email win', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => app.inject({ method: 'POST', url: URL, payload: body })),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);
    expect((await owner.query('SELECT 1 FROM users')).rowCount).toBe(1);
    expect((await owner.query('SELECT 1 FROM sessions')).rowCount).toBe(1);
  });

  it('writes nothing for invalid input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: { ...body, password: 'password1234' },
    });
    expect(res.statusCode).toBe(400);
    expect((await owner.query('SELECT 1 FROM users')).rowCount).toBe(0);
  });

  it('does not treat SQL metacharacters in input as SQL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: URL,
      payload: { ...body, displayName: "Robert'); DROP TABLE users;--" },
    });
    expect(res.statusCode).toBe(201);
    const { rows } = await owner.query('SELECT display_name FROM users');
    expect(rows[0].display_name).toBe("Robert'); DROP TABLE users;--");
  });

  it('reports /health database up through the real pool', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks.database).toBe('up');
  });
});
