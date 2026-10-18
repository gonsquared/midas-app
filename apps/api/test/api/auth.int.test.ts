import { createHash } from 'node:crypto';
import { AuthSessionSchema, ProblemSchema } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  cookieValue,
  createIntegrationContext,
  refreshHeaders,
  registerUser,
  STRONG_PASSWORD,
  type IntegrationContext,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const Q = String.fromCharCode(39);

describeDb('auth: login, refresh, logout (real PostgreSQL)', () => {
  let ctx: IntegrationContext;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    ctx.clock.set(new Date());
    await truncateAll(ctx.owner);
  });

  const login = (email: string, password: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
  const refresh = (token: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: refreshHeaders(token),
    });
  const me = (accessToken: string) =>
    ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

  it('login issues a short-lived access token, a refresh cookie and the preferences', async () => {
    const user = await registerUser(ctx.app, { currency: 'EUR', locale: 'de-DE' });
    const res = await login(user.email.toUpperCase(), STRONG_PASSWORD);
    expect(res.statusCode).toBe(200);
    const session = AuthSessionSchema.parse(res.json());
    expect(session.user.preferences).toMatchObject({ currency: 'EUR', locale: 'de-DE' });
    expect(session.user).not.toHaveProperty('passwordHash');
    const ttl = Date.parse(session.accessTokenExpiresAt) - ctx.clock.now().getTime();
    expect(ttl).toBeGreaterThan(598_000);
    expect(ttl).toBeLessThanOrEqual(600_000);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['set-cookie'])).toMatch(
      /^midas_rt=[0-9a-f-]{36}\.[\w-]{43}; HttpOnly; Secure; SameSite=Strict; Path=\/api\/v1\/auth; Max-Age=2592000$/,
    );
    const rows = await ctx.owner.query('select count(*)::int as n from sessions');
    expect(rows.rows[0].n).toBe(2);
    const last = await ctx.owner.query('select last_login_at from users where id = $1', [user.id]);
    expect(last.rows[0].last_login_at).not.toBeNull();
  });

  it('stores only the SHA-256 of the refresh token', async () => {
    const user = await registerUser(ctx.app);
    const res = await login(user.email, STRONG_PASSWORD);
    const token = cookieValue(res);
    const stored = await ctx.owner.query('select current_refresh_token_hash as h from sessions');
    const hashes = stored.rows.map((r) => (r.h as Buffer).toString('hex'));
    expect(hashes).toContain(createHash('sha256').update(token).digest('hex'));
    expect(hashes).not.toContain(Buffer.from(token).toString('hex'));
  });

  it('answers unknown email and wrong password identically (no user enumeration)', async () => {
    const user = await registerUser(ctx.app);
    const wrongPassword = await login(user.email, 'not the right password 1');
    const unknownEmail = await login('nobody@example.com', 'not the right password 1');
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    const strip = (body: Record<string, unknown>) => ({ ...body, requestId: '', instance: '' });
    expect(strip(wrongPassword.json())).toEqual(strip(unknownEmail.json()));
    expect(ProblemSchema.parse(wrongPassword.json()).code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    expect(unknownEmail.headers['set-cookie']).toBeUndefined();
  });

  it('blocks suspended users only after the password was verified', async () => {
    const user = await registerUser(ctx.app);
    await ctx.owner.query(
      `update users set status = 'suspended', suspended_at = now() where id = $1`,
      [user.id],
    );
    const correct = await login(user.email, STRONG_PASSWORD);
    expect(correct.statusCode).toBe(403);
    expect(ProblemSchema.parse(correct.json()).code).toBe('ACCOUNT_SUSPENDED');
    expect(correct.headers['set-cookie']).toBeUndefined();
    const wrong = await login(user.email, 'wrong password entirely 9');
    expect(wrong.statusCode).toBe(401);
    expect(ProblemSchema.parse(wrong.json()).code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unknown fields and malformed bodies, and treats SQL text as a plain mismatch', async () => {
    const unknownField = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'a@example.com', password: 'x', role: 'admin' },
    });
    expect(unknownField.statusCode).toBe(400);
    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'a@example.com' },
    });
    expect(missing.statusCode).toBe(400);
    const sqli = await login(`${Q} OR ${Q}1${Q}=${Q}1`, `${Q} OR ${Q}1${Q}=${Q}1`);
    expect(sqli.statusCode).toBe(401);
  });

  it('rotates the refresh token on every refresh', async () => {
    const user = await registerUser(ctx.app);
    const res = await refresh(user.refreshToken);
    expect(res.statusCode).toBe(200);
    AuthSessionSchema.parse(res.json());
    const next = cookieValue(res);
    expect(next).not.toBe(user.refreshToken);
    expect((await refresh(next)).statusCode).toBe(200);
  });

  it('detects reuse of a superseded token after the grace window and revokes the session', async () => {
    const user = await registerUser(ctx.app);
    const first = await refresh(user.refreshToken);
    const rotated = cookieValue(first);
    ctx.clock.advance(21_000);
    const replay = await refresh(user.refreshToken);
    expect(replay.statusCode).toBe(401);
    expect(ProblemSchema.parse(replay.json()).code).toBe('SESSION_INVALID');
    expect(String(replay.headers['set-cookie'])).toContain('Max-Age=0');
    // The legitimate holder of the newest token is cut off as well.
    expect((await refresh(rotated)).statusCode).toBe(401);
    const row = await ctx.owner.query('select revoked_reason from sessions where user_id = $1', [
      user.id,
    ]);
    expect(row.rows[0].revoked_reason).toBe('reuse_detected');
    expect((await me(first.json().accessToken)).statusCode).toBe(401);
  });

  it('revokes the session when a token from two or more rotations ago is replayed', async () => {
    const user = await registerUser(ctx.app);
    const second = cookieValue(await refresh(user.refreshToken));
    const third = await refresh(second);
    expect(third.statusCode).toBe(200);
    // Inside the grace window, but `user.refreshToken` is no longer the immediately previous token.
    const replay = await refresh(user.refreshToken);
    expect(replay.statusCode).toBe(401);
    expect(String(replay.headers['set-cookie'])).toContain('Max-Age=0');
    const row = await ctx.owner.query(
      'select revoked_at, revoked_reason from sessions where user_id = $1',
      [user.id],
    );
    expect(row.rows[0].revoked_reason).toBe('reuse_detected');
    expect(row.rows[0].revoked_at).not.toBeNull();
    expect((await refresh(cookieValue(third))).statusCode).toBe(401);
  });

  it('rejects malformed refresh tokens with 401 and leaves the session alone', async () => {
    const user = await registerUser(ctx.app);
    const sid = user.refreshToken.split('.')[0];
    for (const bad of [`${sid}.short`, `${sid}.${'A'.repeat(44)}`, 'A'.repeat(43), `${sid}.`]) {
      expect((await refresh(bad)).statusCode).toBe(401);
    }
    const row = await ctx.owner.query('select revoked_at from sessions where user_id = $1', [
      user.id,
    ]);
    expect(row.rows[0].revoked_at).toBeNull();
    expect((await refresh(user.refreshToken)).statusCode).toBe(200);
  });

  it('tolerates a superseded token inside the 20 second grace window (concurrent tabs)', async () => {
    const user = await registerUser(ctx.app);
    await refresh(user.refreshToken);
    ctx.clock.advance(5_000);
    const second = await refresh(user.refreshToken);
    expect(second.statusCode).toBe(200);
    const row = await ctx.owner.query('select revoked_at from sessions where user_id = $1', [
      user.id,
    ]);
    expect(row.rows[0].revoked_at).toBeNull();
  });

  it('survives truly concurrent refreshes with the same token (two tabs)', async () => {
    const user = await registerUser(ctx.app);
    const results = await Promise.all([1, 2].map(() => refresh(user.refreshToken)));
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    const row = await ctx.owner.query('select revoked_at from sessions where user_id = $1', [
      user.id,
    ]);
    expect(row.rows[0].revoked_at).toBeNull();
  });

  it('rejects refresh without cookie, with a bogus cookie, or from a foreign origin', async () => {
    const user = await registerUser(ctx.app);
    const noCookie = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { origin: APP_ORIGIN, 'x-csrf-protection': '1' },
    });
    expect(noCookie.statusCode).toBe(401);
    expect(ProblemSchema.parse(noCookie.json()).code).toBe('SESSION_INVALID');
    expect(String(noCookie.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await refresh('A'.repeat(43))).statusCode).toBe(401);
    for (const headers of [
      { ...refreshHeaders(user.refreshToken), origin: 'https://evil.example.com' },
      { cookie: `midas_rt=${user.refreshToken}`, 'x-csrf-protection': '1' },
      { cookie: `midas_rt=${user.refreshToken}`, origin: APP_ORIGIN },
    ]) {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers });
      expect(res.statusCode).toBe(403);
      expect(ProblemSchema.parse(res.json()).code).toBe('FORBIDDEN');
    }
  });

  it('expires refresh tokens after 30 days and enforces the 90 day absolute lifetime', async () => {
    const early = await registerUser(ctx.app);
    ctx.clock.advance(31 * DAY);
    expect((await refresh(early.refreshToken)).statusCode).toBe(401);

    ctx.clock.set(new Date());
    const long = await registerUser(ctx.app);
    let token = long.refreshToken;
    for (let i = 0; i < 3; i++) {
      ctx.clock.advance(29 * DAY);
      const res = await refresh(token);
      expect(res.statusCode).toBe(200);
      token = cookieValue(res);
    }
    // 87 days in; the next refresh at day 91 is past the absolute lifetime.
    ctx.clock.advance(4 * DAY);
    expect((await refresh(token)).statusCode).toBe(401);
  });

  it('refuses to refresh for a suspended user and revokes the session', async () => {
    const user = await registerUser(ctx.app);
    await ctx.owner.query(
      `update users set status = 'suspended', suspended_at = now() where id = $1`,
      [user.id],
    );
    expect((await refresh(user.refreshToken)).statusCode).toBe(401);
    const row = await ctx.owner.query('select revoked_reason from sessions where user_id = $1', [
      user.id,
    ]);
    expect(row.rows[0].revoked_reason).toBe('suspended');
  });

  it('logout revokes the session: access and refresh credentials stop working', async () => {
    const user = await registerUser(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: refreshHeaders(user.refreshToken),
    });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await me(user.accessToken)).statusCode).toBe(401);
    expect((await refresh(user.refreshToken)).statusCode).toBe(401);
    const row = await ctx.owner.query('select revoked_reason from sessions where user_id = $1', [
      user.id,
    ]);
    expect(row.rows[0].revoked_reason).toBe('logout');
  });

  it('logout with a bearer token needs no CSRF header, and is idempotent', async () => {
    const user = await registerUser(ctx.app);
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: user.headers,
    });
    expect(first.statusCode).toBe(204);
    expect((await me(user.accessToken)).statusCode).toBe(401);
    // Already revoked: the bearer is no longer valid, so the cookie rules apply.
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: refreshHeaders(user.refreshToken),
    });
    expect(again.statusCode).toBe(204);
  });

  it('logout by cookie without the CSRF protections is forbidden and revokes nothing', async () => {
    const user = await registerUser(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: `midas_rt=${user.refreshToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((await me(user.accessToken)).statusCode).toBe(200);
  });

  it('logout only revokes the calling session', async () => {
    const user = await registerUser(ctx.app);
    const other = await login(user.email, STRONG_PASSWORD);
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: refreshHeaders(user.refreshToken),
    });
    expect((await me(other.json().accessToken)).statusCode).toBe(200);
  });
});
