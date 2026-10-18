import type { Category } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { auditRows, createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createCategory,
  createTransaction,
  createWallet,
  systemCategory,
} from '../support/ledger.js';

describeDb('admin system category lifecycle (real PostgreSQL, E9-F3-S1)', () => {
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

  it('edits name, icon and color and audits only the fields that changed', async () => {
    const boss = await admin();
    const groceries = await systemCategory(ctx.app, boss, 'expense', 'Groceries');
    const res = await call('PATCH', `/api/v1/admin/categories/${groceries.id}`, boss, {
      name: 'Supermarket',
      icon: groceries.icon,
      color: 'teal',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<Category>()).toMatchObject({
      name: 'Supermarket',
      color: 'teal',
      system: true,
    });
    const [row] = await auditRows(ctx.owner, ['admin.category_updated']);
    expect(row?.metadata).toEqual({ fields: ['name', 'color'] });
    expect(row?.target_id).toBe(groceries.id);
    await call('PATCH', `/api/v1/admin/categories/${groceries.id}`, boss, { name: 'Supermarket' });
    await call('PATCH', `/api/v1/admin/categories/${groceries.id}`, boss, {});
    expect(await auditRows(ctx.owner, ['admin.category_updated'])).toHaveLength(1);
  });

  it('answers 404 for a user-owned category and for a missing one; type cannot change', async () => {
    const boss = await admin();
    const regular = await user();
    const mine = await createCategory(ctx.app, regular, { name: 'Mine' });
    const patch = (id: string, payload: unknown) =>
      call('PATCH', `/api/v1/admin/categories/${id}`, boss, payload);
    expect((await patch(mine.id, { name: 'Taken over' })).statusCode).toBe(404);
    for (const action of ['retire', 'restore']) {
      const res = await call('POST', `/api/v1/admin/categories/${mine.id}/${action}`, boss);
      expect(res.statusCode, action).toBe(404);
    }
    expect((await patch('0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e', { name: 'x' })).statusCode).toBe(
      404,
    );
    const groceries = await systemCategory(ctx.app, boss, 'expense', 'Groceries');
    expect((await patch(groceries.id, { type: 'income' })).statusCode).toBe(400);
    expect((await patch(groceries.id, { icon: 'nope' })).statusCode).toBe(400);
    const untouched = (await call('GET', '/api/v1/categories?type=expense', regular)).json<{
      items: Category[];
    }>();
    expect(untouched.items.find((c) => c.id === mine.id)?.name).toBe('Mine');
  });

  it('rejects a rename into the name of another system category', async () => {
    const boss = await admin();
    const groceries = await systemCategory(ctx.app, boss, 'expense', 'Groceries');
    const res = await call('PATCH', `/api/v1/admin/categories/${groceries.id}`, boss, {
      name: 'dining OUT',
    });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('CATEGORY_NAME_TAKEN');
  });

  it('retiring keeps the category on existing transactions but blocks new use; it is idempotent', async () => {
    const boss = await admin();
    const regular = await user();
    const wallet = await createWallet(ctx.app, regular, { currency: 'USD' });
    const fuel = await systemCategory(ctx.app, regular, 'expense', 'Fuel');
    const existing = await createTransaction(ctx.app, regular, {
      type: 'expense',
      walletId: wallet.id,
      categoryId: fuel.id,
      amountMinor: 4000,
      occurredOn: '2026-10-02',
    });
    const retired = await call('POST', `/api/v1/admin/categories/${fuel.id}/retire`, boss);
    expect(retired.json<Category>()).toMatchObject({ retired: true, system: true });
    await call('POST', `/api/v1/admin/categories/${fuel.id}/retire`, boss);
    expect(await auditRows(ctx.owner, ['admin.category_retired'])).toHaveLength(1);

    const kept = await call('GET', `/api/v1/transactions/${existing.id}`, regular);
    expect(kept.json<{ category: Category }>().category).toMatchObject({
      id: fuel.id,
      retired: true,
    });
    const fresh = await call('POST', '/api/v1/transactions', regular, {
      type: 'expense',
      walletId: wallet.id,
      categoryId: fuel.id,
      amountMinor: 1,
      occurredOn: '2026-10-03',
    });
    expect(fresh.statusCode).toBe(422);
    expect(code(fresh)).toBe('CATEGORY_RETIRED');
    const hidden = (await call('GET', '/api/v1/categories?type=expense', regular)).json<{
      items: Category[];
    }>();
    expect(hidden.items.map((c) => c.id)).not.toContain(fuel.id);
    const shown = (await call('GET', '/api/v1/categories?includeRetired=true', regular)).json<{
      items: Category[];
    }>();
    expect(shown.items.map((c) => c.id)).toContain(fuel.id);
  });

  it('restores a retired category, or reports a name clash with a newer one', async () => {
    const boss = await admin();
    const fuel = await systemCategory(ctx.app, boss, 'expense', 'Fuel');
    await call('POST', `/api/v1/admin/categories/${fuel.id}/retire`, boss);
    const taken = await call('POST', '/api/v1/admin/categories', boss, {
      name: 'Fuel',
      type: 'expense',
      icon: 'fuel',
      color: 'amber',
    });
    expect(taken.statusCode).toBe(201);
    const clash = await call('POST', `/api/v1/admin/categories/${fuel.id}/restore`, boss);
    expect(clash.statusCode).toBe(409);
    expect(code(clash)).toBe('CATEGORY_NAME_TAKEN');
    await call('PATCH', `/api/v1/admin/categories/${taken.json<Category>().id}`, boss, {
      name: 'Fuel 2',
    });
    const ok = await call('POST', `/api/v1/admin/categories/${fuel.id}/restore`, boss);
    expect(ok.json<Category>().retired).toBe(false);
    await call('POST', `/api/v1/admin/categories/${fuel.id}/restore`, boss);
    expect(await auditRows(ctx.owner, ['admin.category_restored'])).toHaveLength(1);
    expect(await auditRows(ctx.owner, ['admin.category_retired'])).toHaveLength(1);
  });
});
