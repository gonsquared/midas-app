import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { AuditService } from '../../src/modules/audit/service.js';
import { MetricsRegistry } from '../../src/platform/metrics.js';
import {
  auditRows,
  createIntegrationContext,
  registerUser,
  STRONG_PASSWORD,
  type IntegrationContext,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

const NEW_PASSWORD = 'a completely different passphrase 77';

describeDb('audit trail of password events and secrecy (real PostgreSQL, E9-F1-S2)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    ctx.clock.set(new Date());
    ctx.mailer.sent.length = 0;
    await truncateAll(ctx.owner);
  });

  it('records reset request, reset completion and password change', async () => {
    const user = await registerUser(ctx.app);
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      payload: { email: user.email },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      payload: { email: 'ghost@example.com' },
    });
    await ctx.background.drain();
    const token = /reset-password#token=([\w-]+)/.exec(ctx.mailer.sent[0]?.text ?? '')?.[1] ?? '';
    const reset = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token, newPassword: NEW_PASSWORD },
    });
    expect(reset.statusCode).toBe(204);
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: NEW_PASSWORD },
    });
    const changed = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/me/password',
      headers: { authorization: `Bearer ${login.json<{ accessToken: string }>().accessToken}` },
      payload: { currentPassword: NEW_PASSWORD, newPassword: STRONG_PASSWORD },
    });
    expect(changed.statusCode).toBe(204);
    const rows = await auditRows(ctx.owner, [
      'auth.password_reset_requested',
      'auth.password_reset_completed',
      'user.password_changed',
    ]);
    // Only the known account is recorded for the reset request; nothing for the unknown address.
    expect(rows.map((r) => r.action)).toEqual([
      'auth.password_reset_requested',
      'auth.password_reset_completed',
      'user.password_changed',
    ]);
    expect(rows.every((r) => r.actor_user_id === user.id && r.target_id === user.id)).toBe(true);
  });

  it('never stores passwords, tokens, hashes or financial details', async () => {
    const user = await registerUser(ctx.app);
    const wallet = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/wallets',
      headers: user.headers,
      payload: { name: 'Hidden wallet name', type: 'bank', currency: 'USD' },
    });
    expect(wallet.statusCode).toBe(201);
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: user.headers });
    const dump = JSON.stringify(await auditRows(ctx.owner));
    for (const secret of [
      STRONG_PASSWORD,
      user.accessToken,
      user.refreshToken,
      'argon2',
      'Hidden wallet name',
      user.email,
    ]) {
      expect(dump, secret).not.toContain(secret);
    }
  });

  it('a failing audit write is logged and counted but never fails the request', async () => {
    const failures = new MetricsRegistry().auditWriteFailures;
    const logged: unknown[] = [];
    const brokenDb = {
      insertInto() {
        throw new Error('audit table unavailable');
      },
    };
    const service = new AuditService({
      db: brokenDb as never,
      clock: ctx.clock,
      logger: { error: (obj) => logged.push(obj) },
      failures,
    });
    await expect(
      service.record({ actorUserId: null, action: 'auth.login_failed', targetType: 'system' }),
    ).resolves.toBeUndefined();
    expect(failures.get()).toBe(1);
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain('password');
  });

  it('keeps the audit table append-only for the application role', async () => {
    await registerUser(ctx.app);
    const appRole = ctx.client.pool;
    await expect(
      appRole.query('update audit_logs set action = $1', ['auth.logout']),
    ).rejects.toThrow(/permission denied|append-only/);
    await expect(appRole.query('delete from audit_logs')).rejects.toThrow(
      /permission denied|append-only/,
    );
    await expect(appRole.query('truncate audit_logs')).rejects.toThrow(/permission denied/);
    expect((await auditRows(ctx.owner)).length).toBeGreaterThan(0);
  });
});
