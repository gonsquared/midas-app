import type { AdminUserDetail } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { AdminUsersService } from '../../src/modules/admin/users-service.js';
import { AuditService } from '../../src/modules/audit/service.js';
import { auditRows, createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';

describeDb('last-admin protection (real PostgreSQL, E9-F2-S2)', () => {
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

  const service = () =>
    new AdminUsersService({
      db: ctx.client.db,
      clock: ctx.clock,
      audit: new AuditService({ db: ctx.client.db, clock: ctx.clock }),
    });

  it('refuses to suspend or demote the only active admin (service level, stale actor)', async () => {
    const sole = await admin();
    const bystander = await user(); // an actor that is not an admin (for example demoted meanwhile)
    const suspend = service().suspend({ userId: bystander.id }, sole.id, undefined, {});
    await expect(suspend).rejects.toMatchObject({ code: 'LAST_ADMIN', status: 409 });
    const demote = service().changeRole({ userId: bystander.id }, sole.id, 'user', {});
    await expect(demote).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    expect((await detail(sole, sole.id)).status).toBe('active');
    expect(await auditRows(ctx.owner, ['admin.user_suspended', 'admin.user_role_changed'])).toEqual(
      [],
    );
  });

  it('two admins demoting each other at the same time leave exactly one admin', async () => {
    const a = await admin();
    const b = await admin();
    const [first, second] = await Promise.all([
      call('PATCH', `/api/v1/admin/users/${b.id}/role`, a, { role: 'user' }),
      call('PATCH', `/api/v1/admin/users/${a.id}/role`, b, { role: 'user' }),
    ]);
    // The second request is stopped either by the last-admin check under the lock (409) or, when
    // the first one has already committed, by the role check at the door (403).
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    if (statuses[1] === 409)
      expect(code(first.statusCode === 409 ? first : second)).toBe('LAST_ADMIN');
    const admins = await ctx.owner.query(
      `select count(*)::int as n from users where role = 'admin' and status = 'active'`,
    );
    expect(admins.rows[0].n).toBe(1);
    expect(await auditRows(ctx.owner, ['admin.user_role_changed'])).toHaveLength(1);
  });

  it('two admins suspending each other at the same time leave one active admin', async () => {
    const a = await admin();
    const b = await admin();
    const [first, second] = await Promise.all([
      call('POST', `/api/v1/admin/users/${b.id}/suspend`, a, {}),
      call('POST', `/api/v1/admin/users/${a.id}/suspend`, b, {}),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    const admins = await ctx.owner.query(
      `select count(*)::int as n from users where role = 'admin' and status = 'active'`,
    );
    expect(admins.rows[0].n).toBe(1);
    expect(await auditRows(ctx.owner, ['admin.user_suspended'])).toHaveLength(1);
  });

  it('a suspended admin does not count as an active admin, and can still be demoted', async () => {
    const a = await admin();
    const b = await admin();
    await call('POST', `/api/v1/admin/users/${b.id}/suspend`, a, {});
    const stale = service().changeRole({ userId: b.id }, a.id, 'user', {});
    await expect(stale).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    const demoted = await call('PATCH', `/api/v1/admin/users/${b.id}/role`, a, { role: 'user' });
    expect(demoted.json<AdminUserDetail>()).toMatchObject({ role: 'user', status: 'suspended' });
  });

  it('a demoted actor can no longer change other admins (re-checked under the lock)', async () => {
    const a = await admin();
    const b = await admin();
    const c = await admin();
    await ctx.owner.query(`update users set role = 'user' where id = $1`, [b.id]);
    const stale = service().suspend({ userId: b.id }, c.id, undefined, {});
    await expect(stale).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect((await detail(a, c.id)).status).toBe('active');
  });
});
