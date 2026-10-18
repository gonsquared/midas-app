import { PlatformMetricsSchema, type PlatformMetrics } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';
import { createTransaction, createWallet, systemCategory } from '../support/ledger.js';

describeDb('platform metrics (real PostgreSQL, E9-F3-S2)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  let run = 0;
  beforeEach(async () => {
    await truncateAll(ctx.owner);
    // The service caches per app instance, so every test starts after the previous TTL.
    run += 1;
    ctx.clock.set(new Date(Date.now() + run * 6 * 60_000));
  });
  const { call, admin, user } = adminHelpers(() => ctx);
  const metrics = async (actor: Awaited<ReturnType<typeof admin>>) => {
    const res = await call('GET', '/api/v1/admin/metrics', actor);
    expect(res.statusCode).toBe(200);
    return PlatformMetricsSchema.parse(res.json()) as PlatformMetrics;
  };

  async function seed() {
    const boss = await admin({ displayName: 'Private Admin Name' });
    const alice = await user({ displayName: 'Alice Secret' });
    const bob = await user();
    const spare = await createWallet(ctx.app, alice, { name: 'Alice Savings', currency: 'USD' });
    const wallet = await createWallet(ctx.app, alice, { name: 'Alice Main', currency: 'USD' });
    await createWallet(ctx.app, bob, { currency: 'EUR' });
    await call('POST', `/api/v1/wallets/${spare.id}/archive`, alice);
    const cat = await systemCategory(ctx.app, alice, 'expense');
    await createTransaction(ctx.app, alice, {
      type: 'expense',
      walletId: wallet.id,
      categoryId: cat.id,
      amountMinor: 123456,
      occurredOn: '2026-10-01',
      note: 'Very private note',
    });
    await call('POST', '/api/v1/recurring-templates', alice, {
      name: 'Private template',
      type: 'expense',
      walletId: wallet.id,
      categoryId: cat.id,
      amountMinor: 999,
      frequency: 'monthly',
      startDate: new Date().toISOString().slice(0, 10),
    });
    await call('POST', `/api/v1/admin/users/${bob.id}/suspend`, boss, {});
    await ctx.owner.query(
      `update users set last_login_at = now() - interval '45 days' where id = $1`,
      [bob.id],
    );
    return { boss, alice, bob };
  }

  it('counts users, wallets, transactions and active templates', async () => {
    const { boss } = await seed();
    const result = await metrics(boss);
    expect(result.users).toEqual({ total: 3, active30d: 0, new30d: 3, suspended: 1, admins: 1 });
    expect(result.wallets).toEqual({ total: 3, active: 2 });
    expect(result.transactions).toEqual({ total: 1, last30d: 1 });
    expect(result.recurringTemplates).toEqual({ active: 1 });
    expect(result.generatedAt).toBe(ctx.clock.now().toISOString());
  });

  it('counts a recent sign-in as active and excludes old accounts from "new"', async () => {
    const { boss, alice } = await seed();
    await ctx.owner.query(
      `update users set last_login_at = now() - interval '2 days' where id = $1`,
      [alice.id],
    );
    await ctx.owner.query(
      `update users set created_at = now() - interval '60 days' where id = $1`,
      [alice.id],
    );
    const result = await metrics(boss);
    expect(result.users).toMatchObject({ active30d: 1, new30d: 2, total: 3 });
  });

  it('exposes only aggregates: no emails, names, wallet names, notes or amounts', async () => {
    const { boss } = await seed();
    const res = await call('GET', '/api/v1/admin/metrics', boss);
    for (const secret of ['Alice', 'Secret', 'Private', 'Savings', '123456', 'example.com']) {
      expect(res.body, secret).not.toContain(secret);
    }
    const flatten = (value: unknown): unknown[] =>
      typeof value === 'object' && value !== null ? Object.values(value).flatMap(flatten) : [value];
    const leaves = flatten(JSON.parse(res.body));
    expect(leaves.filter((leaf) => typeof leaf !== 'number' && typeof leaf !== 'string')).toEqual(
      [],
    );
  });

  it('caches for five minutes and shares one computation between concurrent callers', async () => {
    const { boss } = await seed();
    const [a, b, c] = await Promise.all([metrics(boss), metrics(boss), metrics(boss)]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    await user();
    expect((await metrics(boss)).users.total).toBe(3);
    ctx.clock.set(new Date(Date.now() + 4 * 60_000));
    expect((await metrics(boss)).users.total).toBe(3);
  });
});
