import type { AdminUserDetail } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  auditRows,
  createIntegrationContext,
  refreshHeaders,
  STRONG_PASSWORD,
  type IntegrationContext,
} from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';

const MISSING = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';

describeDb('admin suspend, reactivate and role change (real PostgreSQL, E9-F2-S2)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
  });
  const { call, code, admin, user, detail } = adminHelpers(() => ctx);

  it('suspending revokes every session at once and blocks sign-in', async () => {
    const boss = await admin();
    const target = await user();
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: target.email, password: STRONG_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect((await detail(boss, target.id)).activeSessionCount).toBe(2);

    const res = await call('POST', `/api/v1/admin/users/${target.id}/suspend`, boss, {
      reason: 'Abuse report #12',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminUserDetail>()).toMatchObject({
      id: target.id,
      status: 'suspended',
      suspendedReason: 'Abuse report #12',
      activeSessionCount: 0,
    });
    expect((await call('GET', '/api/v1/me', target)).statusCode).toBe(401);
    const refresh = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: refreshHeaders(target.refreshToken),
    });
    expect(refresh.statusCode).toBe(401);
    const blocked = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: target.email, password: STRONG_PASSWORD },
    });
    expect(blocked.statusCode).toBe(403);
    expect(code(blocked)).toBe('ACCOUNT_SUSPENDED');
    const revoked = await ctx.owner.query(
      `select count(*)::int as n from sessions where user_id = $1 and revoked_reason = 'suspended'`,
      [target.id],
    );
    expect(revoked.rows[0].n).toBe(2);
  });

  it('is idempotent and writes one audit row per real change', async () => {
    const boss = await admin();
    const target = await user();
    const url = `/api/v1/admin/users/${target.id}`;
    await call('POST', `${url}/suspend`, boss);
    const again = await call('POST', `${url}/suspend`, boss, { reason: 'another' });
    expect(again.statusCode).toBe(200);
    expect(again.json<AdminUserDetail>().suspendedReason).toBeNull();
    expect(await auditRows(ctx.owner, ['admin.user_suspended'])).toHaveLength(1);

    const back = await call('POST', `${url}/reactivate`, boss);
    expect(back.json<AdminUserDetail>()).toMatchObject({
      status: 'active',
      suspendedAt: null,
      suspendedReason: null,
    });
    await call('POST', `${url}/reactivate`, boss);
    expect(await auditRows(ctx.owner, ['admin.user_reactivated'])).toHaveLength(1);
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: target.email, password: STRONG_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it('changes a role, audits { from, to } and applies it on the next request', async () => {
    const boss = await admin();
    const target = await user();
    expect((await call('GET', '/api/v1/admin/users', target)).statusCode).toBe(403);
    const res = await call('PATCH', `/api/v1/admin/users/${target.id}/role`, boss, {
      role: 'admin',
    });
    expect(res.json<AdminUserDetail>().role).toBe('admin');
    expect((await call('GET', '/api/v1/admin/users', target)).statusCode).toBe(200);
    const same = await call('PATCH', `/api/v1/admin/users/${target.id}/role`, boss, {
      role: 'admin',
    });
    expect(same.statusCode).toBe(200);
    await call('PATCH', `/api/v1/admin/users/${target.id}/role`, boss, { role: 'user' });
    expect((await call('GET', '/api/v1/admin/users', target)).statusCode).toBe(403);
    const rows = await auditRows(ctx.owner, ['admin.user_role_changed']);
    expect(rows.map((r) => r.metadata)).toEqual([
      { from: 'user', to: 'admin' },
      { from: 'admin', to: 'user' },
    ]);
    expect(rows[0]).toMatchObject({
      actor_user_id: boss.id,
      target_type: 'user',
      target_id: target.id,
    });
    expect(rows[0]?.request_id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it('cannot suspend, reactivate or change the role of oneself', async () => {
    const boss = await admin();
    const other = await admin();
    for (const [method, path, body] of [
      ['POST', 'suspend', {}],
      ['POST', 'reactivate', undefined],
      ['PATCH', 'role', { role: 'user' }],
    ] as const) {
      const res = await call(method, `/api/v1/admin/users/${boss.id}/${path}`, boss, body);
      expect(res.statusCode, path).toBe(409);
      expect(code(res)).toBe('CANNOT_MODIFY_SELF');
    }
    expect((await detail(other, boss.id)).role).toBe('admin');
    expect(
      await auditRows(ctx.owner, ['admin.user_suspended', 'admin.user_role_changed']),
    ).toHaveLength(0);
  });

  it('returns 404 for unknown users and 400 for malformed requests', async () => {
    const boss = await admin();
    for (const [method, path, body] of [
      ['POST', 'suspend', {}],
      ['POST', 'reactivate', undefined],
      ['PATCH', 'role', { role: 'admin' }],
    ] as const) {
      expect(
        (await call(method, `/api/v1/admin/users/${MISSING}/${path}`, boss, body)).statusCode,
      ).toBe(404);
    }
    const target = await user();
    const url = `/api/v1/admin/users/${target.id}`;
    const bad = [
      call('POST', `${url}/suspend`, boss, { reason: 'x'.repeat(501) }),
      call('POST', `${url}/suspend`, boss, { reason: 'ok', extra: true }),
      call('PATCH', `${url}/role`, boss, { role: 'owner' }),
      call('PATCH', `${url}/role`, boss, {}),
      call('PATCH', `${url}/role`, boss, { role: 'admin', email: 'x@example.com' }),
      call('POST', '/api/v1/admin/users/not-a-uuid/suspend', boss, {}),
    ];
    for (const res of await Promise.all(bad)) expect(res.statusCode).toBe(400);
    expect((await detail(boss, target.id)).role).toBe('user');
    expect(APP_ORIGIN).toBeDefined();
  });
});
