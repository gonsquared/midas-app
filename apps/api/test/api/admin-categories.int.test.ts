import { CategorySchema, type Category } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { auditRows, createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';
import { createCategory, systemCategory } from '../support/ledger.js';

const body = (overrides: Record<string, unknown> = {}) => ({
  name: 'Crypto fees',
  type: 'expense',
  icon: 'paw-print',
  color: 'orange',
  ...overrides,
});

describeDb('admin system categories (real PostgreSQL, E9-F3-S1)', () => {
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

  it('lists system categories only, retired ones by default, with filters', async () => {
    const boss = await admin();
    const regular = await user();
    await createCategory(ctx.app, regular, { name: 'Private one' });
    const fuel = await systemCategory(ctx.app, regular, 'expense', 'Fuel');
    await ctx.owner.query('update categories set retired_at = now() where id = $1', [fuel.id]);
    const all = (await call('GET', '/api/v1/admin/categories', boss)).json<{ items: Category[] }>()
      .items;
    expect(all.every((c) => c.system)).toBe(true);
    expect(all.map((c) => c.name)).not.toContain('Private one');
    expect(all.find((c) => c.id === fuel.id)?.retired).toBe(true);
    const active = (await call('GET', '/api/v1/admin/categories?includeRetired=false', boss)).json<{
      items: Category[];
    }>();
    expect(active.items.map((c) => c.id)).not.toContain(fuel.id);
    const income = (await call('GET', '/api/v1/admin/categories?type=income', boss)).json<{
      items: Category[];
    }>();
    expect(income.items.length).toBeGreaterThan(0);
    expect(income.items.every((c) => c.type === 'income')).toBe(true);
    expect((await call('GET', '/api/v1/admin/categories?type=other', boss)).statusCode).toBe(400);
  });

  it('creates a system category that every user sees, and audits it', async () => {
    const boss = await admin();
    const regular = await user();
    const res = await call('POST', '/api/v1/admin/categories', boss, body());
    expect(res.statusCode).toBe(201);
    const created = CategorySchema.parse(res.json());
    expect(created).toMatchObject({
      name: 'Crypto fees',
      system: true,
      retired: false,
      type: 'expense',
    });
    const seen = await call('GET', '/api/v1/categories?type=expense', regular);
    expect(seen.json<{ items: Category[] }>().items.map((c) => c.id)).toContain(created.id);
    const [row] = await auditRows(ctx.owner, ['admin.category_created']);
    expect(row).toMatchObject({
      actor_user_id: boss.id,
      target_type: 'category',
      target_id: created.id,
    });
    expect(row?.metadata).toEqual({ type: 'expense' });
    const stored = await ctx.owner.query(
      'select owner_user_id, system_key from categories where id = $1',
      [created.id],
    );
    expect(stored.rows[0]).toEqual({ owner_user_id: null, system_key: null });
  });

  it('rejects a duplicate name among system categories of the same type only', async () => {
    const boss = await admin();
    await call('POST', '/api/v1/admin/categories', boss, body());
    const dup = await call('POST', '/api/v1/admin/categories', boss, body({ name: 'CRYPTO FEES' }));
    expect(dup.statusCode).toBe(409);
    expect(code(dup)).toBe('CATEGORY_NAME_TAKEN');
    expect(
      (await call('POST', '/api/v1/admin/categories', boss, body({ type: 'income' }))).statusCode,
    ).toBe(201);
    expect(await auditRows(ctx.owner, ['admin.category_created'])).toHaveLength(2);
  });

  it('validates the body strictly (allowlisted icon and color, no mass assignment)', async () => {
    const boss = await admin();
    const bad = [
      body({ icon: 'skull-and-crossbones' }),
      body({ color: '#ff0000' }),
      body({ name: '' }),
      body({ name: 'x'.repeat(41) }),
      body({ type: 'transfer' }),
      body({ system: false }),
      body({ ownerUserId: boss.id }),
      body({ retired: true }),
      { name: 'No type', icon: 'tag', color: 'blue' },
    ];
    for (const payload of bad) {
      const res = await call('POST', '/api/v1/admin/categories', boss, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await auditRows(ctx.owner, ['admin.category_created'])).toEqual([]);
  });
});
