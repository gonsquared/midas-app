import { AuditLogPageSchema, type AuditLogPage } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { auditFilterHash } from '../../src/modules/audit/cursor.js';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';

describeDb('audit log query API (real PostgreSQL, E9-F1-S2)', () => {
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
  const { call, code, admin, user } = adminHelpers(() => ctx);
  const query = async (actor: Awaited<ReturnType<typeof admin>>, qs = '') => {
    const res = await call('GET', `/api/v1/admin/audit-logs${qs}`, actor);
    expect(res.statusCode, qs).toBe(200);
    return AuditLogPageSchema.parse(res.json()) as AuditLogPage;
  };

  async function seed() {
    const boss = await admin();
    const other = await admin();
    const target = await user();
    await call('POST', `/api/v1/admin/users/${target.id}/suspend`, boss, {});
    await call('POST', `/api/v1/admin/users/${target.id}/reactivate`, other);
    await call('POST', '/api/v1/admin/categories', boss, {
      name: 'Audit cat',
      type: 'expense',
      icon: 'tag',
      color: 'blue',
    });
    return { boss, other, target };
  }

  it('returns entries newest first with actor, target and context', async () => {
    const { boss, target } = await seed();
    const page = await query(boss, '?limit=100');
    const times = page.items.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
    const suspended = page.items.find((e) => e.action === 'admin.user_suspended');
    expect(suspended).toMatchObject({
      actor: { id: boss.id, email: boss.email },
      target: { type: 'user', id: target.id },
      ip: '127.0.0.1',
    });
    expect(suspended?.requestId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it('filters by actor id or exact case-insensitive email, action, target and date', async () => {
    const { boss, other, target } = await seed();
    const byActor = await query(boss, `?actorId=${other.id}&action=admin.user_reactivated`);
    expect(byActor.items.map((e) => e.action)).toEqual(['admin.user_reactivated']);
    const byEmail = await query(
      boss,
      `?actorEmail=${encodeURIComponent(boss.email.toUpperCase())}&limit=100`,
    );
    expect(byEmail.items.length).toBeGreaterThan(0);
    expect(byEmail.items.every((e) => e.actor?.id === boss.id)).toBe(true);
    const partial = await query(boss, `?actorEmail=${encodeURIComponent(boss.email.slice(0, 8))}`);
    expect(partial.items).toEqual([]);
    const unknown = await query(boss, '?actorEmail=nobody%40example.com');
    expect(unknown).toEqual({ items: [], nextCursor: null });
    const actions = await query(boss, '?action=admin.user_suspended&action=admin.category_created');
    expect(actions.items.map((e) => e.action).sort()).toEqual([
      'admin.category_created',
      'admin.user_suspended',
    ]);
    const byTarget = await query(boss, `?targetType=user&targetId=${target.id}&limit=100`);
    expect(byTarget.items.every((e) => e.target.id === target.id)).toBe(true);
    expect(byTarget.items.map((e) => e.action)).toContain('admin.user_suspended');
    const today = new Date().toISOString().slice(0, 10);
    expect(
      (await query(boss, `?from=${today}&to=${today}&limit=100`)).items.length,
    ).toBeGreaterThan(0);
    expect((await query(boss, '?from=2020-01-01&to=2020-01-31')).items).toEqual([]);
  });

  it('pages with an opaque cursor and rejects one from other filters', async () => {
    const { boss } = await seed();
    const all = await query(boss, '?limit=100');
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const page = await query(boss, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(all.items.map((e) => e.id));
    expect(new Set(seen).size).toBe(seen.length);
    const first = await query(boss, '?limit=1');
    const mismatched = await call(
      'GET',
      `/api/v1/admin/audit-logs?limit=1&targetType=user&cursor=${first.nextCursor}`,
      boss,
    );
    expect(mismatched.statusCode).toBe(400);
    expect(code(mismatched)).toBe('INVALID_CURSOR');
    expect((await call('GET', '/api/v1/admin/audit-logs?cursor=garbage', boss)).statusCode).toBe(
      400,
    );
  });

  it('rejects a cursor with a timestamp outside years 1900-2100', async () => {
    const boss = await admin();
    const id = '0199c6a8-0000-7000-8000-00000000000a';
    for (const at of ['0000-01-01T00:00:00.000Z', '2101-01-01T00:00:00.000Z']) {
      const cursor = Buffer.from(
        JSON.stringify({ v: 1, f: auditFilterHash({}), k: [at, id] }),
      ).toString('base64url');
      const res = await call('GET', `/api/v1/admin/audit-logs?cursor=${cursor}`, boss);
      expect(res.statusCode).toBe(400);
      expect(code(res)).toBe('INVALID_CURSOR');
    }
  });

  it('validates parameters', async () => {
    const boss = await admin();
    for (const qs of [
      'limit=0',
      'limit=101',
      'action=drop.table',
      'targetType=wallet',
      'targetId=x',
      'targetId=0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e', // needs targetType
      'actorId=x',
      'from=2026-02-30',
      'from=2026-02-02&to=2026-02-01',
      'sort=asc',
      'q=1',
    ]) {
      const res = await call('GET', `/api/v1/admin/audit-logs?${qs}`, boss);
      expect(res.statusCode, qs).toBe(400);
    }
  });

  it('a targetId filter without targetType is rejected with a stable code', async () => {
    const boss = await admin();
    const res = await call(
      'GET',
      '/api/v1/admin/audit-logs?targetId=0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e',
      boss,
    );
    expect(res.statusCode).toBe(400);
  });

  it('the target filter is served by the (target_type, target_id, ...) index', async () => {
    const target = await user();
    await ctx.owner.query(
      `insert into audit_logs (id, occurred_at, action, target_type, target_id)
       select gen_random_uuid(), now() - (g || ' seconds')::interval, 'admin.user_suspended', 'user',
              case when g % 1000 = 0 then $1::uuid else gen_random_uuid() end
         from generate_series(1, 30000) g`,
      [target.id],
    );
    await ctx.owner.query('analyze audit_logs');
    const plan = await ctx.owner.query(
      `explain (format json) select id from audit_logs
        where target_type = 'user' and target_id = $1
        order by occurred_at desc, id desc limit 51`,
      [target.id],
    );
    expect(JSON.stringify(plan.rows[0]['QUERY PLAN'])).toContain(
      'ix_audit_logs__target_occurred_at',
    );
  });

  it('offers no way to create, change or delete entries', async () => {
    const boss = await admin();
    const id = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';
    for (const [method, url] of [
      ['POST', '/api/v1/admin/audit-logs'],
      ['PUT', '/api/v1/admin/audit-logs'],
      ['PATCH', `/api/v1/admin/audit-logs/${id}`],
      ['DELETE', `/api/v1/admin/audit-logs/${id}`],
      ['DELETE', '/api/v1/admin/audit-logs'],
    ] as const) {
      const res = await call(method, url, boss, {});
      expect([404, 405], `${method} ${url}`).toContain(res.statusCode);
    }
    const count = await ctx.owner.query('select count(*)::int as n from audit_logs');
    expect(count.rows[0].n).toBeGreaterThan(0);
  });
});
