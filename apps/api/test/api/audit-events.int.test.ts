import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  auditRows,
  cookieValue,
  createIntegrationContext,
  refreshHeaders,
  registerUser,
  STRONG_PASSWORD,
  type IntegrationContext,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

const HMAC_SECRET = 'audit-hmac-secret-with-at-least-32-characters';

describeDb('audit trail of auth events (real PostgreSQL, E9-F1-S2)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext({ AUDIT_HMAC_SECRET: HMAC_SECRET });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    ctx.clock.set(new Date());
    ctx.mailer.sent.length = 0;
    await truncateAll(ctx.owner);
  });

  const login = (email: string, password: string, headers: Record<string, string> = {}) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
      headers,
    });

  it('records registration with the request context', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'user-agent': 'AuditTest/1.0', 'x-request-id': 'req-audit-0001' },
      payload: { email: 'new@example.com', password: STRONG_PASSWORD, displayName: 'New Person' },
    });
    const id = res.json<{ user: { id: string } }>().user.id;
    const [row] = await auditRows(ctx.owner, ['auth.registered']);
    expect(row).toMatchObject({
      actor_user_id: id,
      target_type: 'user',
      target_id: id,
      user_agent: 'AuditTest/1.0',
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      ip: '127.0.0.1',
      metadata: {},
    });
  });

  it('stores a server-generated request id and ignores a forged X-Request-Id', async () => {
    const forged = 'forged-id-0001';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-request-id': forged },
      payload: { email: 'forge@example.com', password: STRONG_PASSWORD, displayName: 'Forger' },
    });
    expect(res.headers['x-request-id']).toBe(forged); // client id still correlates logs
    const [row] = await auditRows(ctx.owner, ['auth.registered']);
    expect(row?.request_id).not.toBe(forged);
    expect(row?.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('records successful and failed sign-ins without any credential', async () => {
    const user = await registerUser(ctx.app);
    const ok = await login(user.email, STRONG_PASSWORD);
    const sessionId = ok.json<{ accessToken: string }>().accessToken;
    expect(sessionId).toBeDefined();
    await login(user.email, 'wrong password entirely');
    await login('ghost@example.com', 'whatever password 1');
    const rows = await auditRows(ctx.owner, ['auth.login_succeeded', 'auth.login_failed']);
    expect(rows.map((r) => r.action)).toEqual([
      'auth.login_succeeded',
      'auth.login_failed',
      'auth.login_failed',
    ]);
    expect(rows[0]).toMatchObject({ actor_user_id: user.id, target_type: 'session' });
    expect(rows[1]).toMatchObject({
      actor_user_id: user.id,
      target_type: 'user',
      target_id: user.id,
      metadata: {},
    });
    const unknown = rows[2];
    expect(unknown).toMatchObject({ actor_user_id: null, target_type: 'system', target_id: null });
    expect(unknown?.metadata.emailHmac).toMatch(/^[0-9a-f]{64}$/);
    const everything = JSON.stringify(await auditRows(ctx.owner));
    expect(everything).not.toContain('ghost@example.com');
    expect(everything).not.toContain('whatever password');
    expect(everything).not.toContain(STRONG_PASSWORD);
    expect(everything).not.toContain('wrong password');
  });

  it('records a blocked sign-in of a suspended account', async () => {
    const user = await registerUser(ctx.app);
    await ctx.owner.query(
      `update users set status = 'suspended', suspended_at = now() where id = $1`,
      [user.id],
    );
    const res = await login(user.email, STRONG_PASSWORD);
    expect(res.statusCode).toBe(403);
    const [row] = await auditRows(ctx.owner, ['auth.login_blocked_suspended']);
    expect(row).toMatchObject({ actor_user_id: user.id, target_id: user.id });
  });

  it('records logout once per revoked session', async () => {
    const user = await registerUser(ctx.app);
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: user.headers,
    });
    expect(first.statusCode).toBe(204);
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: user.headers });
    const second = await login(user.email, STRONG_PASSWORD);
    const cookie = cookieValue(second);
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: refreshHeaders(cookie),
    });
    const rows = await auditRows(ctx.owner, ['auth.logout']);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.actor_user_id === user.id && r.target_type === 'session')).toBe(
      true,
    );
  });

  it('records refresh-token reuse', async () => {
    const user = await registerUser(ctx.app);
    const rotated = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: refreshHeaders(user.refreshToken),
    });
    expect(rotated.statusCode).toBe(200);
    ctx.clock.set(new Date(Date.now() + 60_000));
    const replay = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: refreshHeaders(user.refreshToken),
    });
    expect(replay.statusCode).toBe(401);
    const [row] = await auditRows(ctx.owner, ['auth.session_reuse_detected']);
    expect(row).toMatchObject({ actor_user_id: user.id, target_type: 'session' });
  });
});
