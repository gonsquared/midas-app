import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { auditRows, createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';
import { createTransaction, createWallet, systemCategory } from '../support/ledger.js';

describeDb('admin privacy boundary at runtime (real PostgreSQL, ADR-018)', () => {
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
  const { call, admin, user } = adminHelpers(() => ctx);

  it('admin responses and audit rows never contain a user financial data', async () => {
    const boss = await admin();
    const alice = await user({ displayName: 'Alice Ledger' });
    const wallet = await createWallet(ctx.app, alice, {
      name: 'Wallet-MARKER-77',
      currency: 'USD',
    });
    const cat = await systemCategory(ctx.app, alice, 'expense');
    await createTransaction(ctx.app, alice, {
      type: 'expense',
      walletId: wallet.id,
      categoryId: cat.id,
      amountMinor: 424242,
      occurredOn: '2026-10-02',
      note: 'NOTE-MARKER-88',
    });
    await call('POST', `/api/v1/admin/users/${alice.id}/suspend`, boss, { reason: 'review' });
    await call('POST', `/api/v1/admin/users/${alice.id}/reactivate`, boss);
    const urls = [
      '/api/v1/admin/users',
      `/api/v1/admin/users/${alice.id}`,
      '/api/v1/admin/metrics',
      '/api/v1/admin/audit-logs?limit=100',
      '/api/v1/admin/categories',
    ];
    const markers = ['MARKER', '424242', wallet.id];
    for (const url of urls) {
      const body = (await call('GET', url, boss)).body;
      for (const marker of markers) expect(body, `${url} ${marker}`).not.toContain(marker);
    }
    const stored = JSON.stringify(await auditRows(ctx.owner));
    for (const marker of markers) expect(stored).not.toContain(marker);
  });

  it('an admin has no extra access to the ledger of other users (404 like anyone else)', async () => {
    const boss = await admin();
    const alice = await user();
    const wallet = await createWallet(ctx.app, alice, { currency: 'USD' });
    const cat = await systemCategory(ctx.app, alice, 'expense');
    const tx = await createTransaction(ctx.app, alice, {
      type: 'expense',
      walletId: wallet.id,
      categoryId: cat.id,
      amountMinor: 500,
      occurredOn: '2026-10-02',
    });
    const budget = await call('POST', '/api/v1/budgets', alice, {
      scope: 'overall',
      amountMinor: 1000,
    });
    const template = await call('POST', '/api/v1/recurring-templates', alice, {
      name: 'T',
      type: 'expense',
      walletId: wallet.id,
      categoryId: cat.id,
      amountMinor: 1,
      frequency: 'monthly',
      startDate: new Date().toISOString().slice(0, 10),
    });
    const templateId = template.json<{ id: string }>().id;
    const probes = [
      `/api/v1/wallets/${wallet.id}`,
      `/api/v1/transactions/${tx.id}`,
      `/api/v1/budgets/${budget.json<{ id: string }>().id}`,
      `/api/v1/recurring-templates/${templateId}`,
      `/api/v1/recurring-templates/${templateId}/runs`,
    ];
    for (const url of probes) expect((await call('GET', url, boss)).statusCode, url).toBe(404);
    const own = await call('GET', '/api/v1/transactions', boss);
    expect(own.json<{ items: unknown[] }>().items).toEqual([]);
    const exported = await call('GET', '/api/v1/transactions/export', boss);
    expect(exported.body.split('\r\n').filter(Boolean)).toHaveLength(1); // header only
    const summary = await call('GET', '/api/v1/reports/summary', boss);
    expect(summary.json<{ wallets: unknown[] }>().wallets).toEqual([]);
    const missing = [`/api/v1/admin/users/${alice.id}/transactions`, '/api/v1/admin/wallets'];
    for (const url of missing) expect((await call('GET', url, boss)).statusCode, url).toBe(404);
  });
});
