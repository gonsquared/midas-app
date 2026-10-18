import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';
import { createTransaction, createWallet, systemCategory } from '../support/ledger.js';

const MISSING = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';

/** QA gate for Sprint 3: expired tokens, prototype pollution, length boundaries and report isolation. */
describeDb('Sprint 3 QA security gate (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
    ctx.clock.set(new Date('2026-10-18T12:00:00.000Z'));
  });
  const { call, code, admin, user } = adminHelpers(() => ctx);

  it('should reject an expired access token on budgets, reports, recurring, export and admin routes', async () => {
    const boss = await admin();
    const urls = [
      '/api/v1/budgets',
      '/api/v1/reports/summary',
      '/api/v1/reports/trend',
      '/api/v1/reports/category-breakdown',
      '/api/v1/recurring-templates',
      '/api/v1/transactions/export',
      '/api/v1/admin/users',
      '/api/v1/admin/metrics',
      '/api/v1/admin/audit-logs',
    ];
    for (const url of urls) expect((await call('GET', url, boss)).statusCode, url).toBe(200);
    ctx.clock.advance(60 * 60 * 1000);
    for (const url of urls) {
      const res = await call('GET', url, boss);
      expect(res.statusCode, 'expired token on ' + url).toBe(401);
      expect(res.body).not.toMatch(/stack|jose|JWT[A-Za-z]*Error|\.ts:/i);
    }
  });

  it('should return 401 for unauthenticated requests to every report and recurring route', async () => {
    const routes: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string]> = [
      ['GET', '/api/v1/reports/summary'],
      ['GET', '/api/v1/reports/trend'],
      ['GET', '/api/v1/reports/category-breakdown'],
      ['GET', '/api/v1/recurring-templates'],
      ['POST', '/api/v1/recurring-templates'],
      ['POST', '/api/v1/recurring-templates/preview'],
      ['GET', '/api/v1/recurring-templates/' + MISSING],
      ['PATCH', '/api/v1/recurring-templates/' + MISSING],
      ['DELETE', '/api/v1/recurring-templates/' + MISSING],
      ['POST', '/api/v1/recurring-templates/' + MISSING + '/pause'],
      ['POST', '/api/v1/recurring-templates/' + MISSING + '/resume'],
      ['GET', '/api/v1/recurring-templates/' + MISSING + '/runs'],
    ];
    for (const [method, url] of routes) {
      expect((await call(method, url, null)).statusCode, method + ' ' + url).toBe(401);
    }
  });

  it('should reject prototype pollution payloads on budget, recurring and admin write routes', async () => {
    const boss = await admin();
    const target = await user();
    const owner = await registerUser(ctx.app, { currency: 'USD' });
    const payloads = [
      '{"__proto__":{"polluted":true}}',
      '{"constructor":{"prototype":{"polluted":true}}}',
      '{"reason":"x","__proto__":{"polluted":true}}',
    ];
    const targets: Array<[string, string, { headers: { authorization: string } }]> = [
      ['POST', '/api/v1/budgets', owner],
      ['POST', '/api/v1/recurring-templates', owner],
      ['POST', '/api/v1/recurring-templates/preview', owner],
      ['POST', '/api/v1/admin/categories', boss],
      ['PATCH', '/api/v1/admin/users/' + target.id + '/role', boss],
      ['POST', '/api/v1/admin/users/' + target.id + '/suspend', boss],
    ];
    for (const [method, url, actor] of targets) {
      for (const payload of payloads) {
        const res = await ctx.app.inject({
          method: method as 'POST',
          url,
          headers: { ...actor.headers, 'content-type': 'application/json' },
          payload,
        });
        expect(res.statusCode, method + ' ' + url + ' ' + payload).toBe(400);
        expect(res.body).not.toMatch(/polluted|stack|\.ts:/);
      }
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    const row = await ctx.owner.query('select role, status from users where id = $1', [target.id]);
    expect(row.rows[0]).toEqual({ role: 'user', status: 'active' });
  });

  it('should enforce declared length limits on recurring, suspension and audit filters with 400, not 500', async () => {
    const boss = await admin();
    const target = await user();
    const owner = await registerUser(ctx.app, { currency: 'USD' });
    const wallet = await createWallet(ctx.app, owner, { name: 'Main', currency: 'USD' });
    const rent = await systemCategory(ctx.app, owner, 'expense', 'Housing');
    const template = (overrides: Record<string, unknown>) => ({
      name: 'Rent',
      type: 'expense',
      walletId: wallet.id,
      categoryId: rent.id,
      amountMinor: 1000,
      frequency: 'monthly',
      startDate: '2026-10-20',
      ...overrides,
    });
    const post = (body: Record<string, unknown>) =>
      call('POST', '/api/v1/recurring-templates', owner, body);

    expect((await post(template({ name: 'a'.repeat(60) }))).statusCode).toBe(201);
    for (const bad of [
      template({ name: 'a'.repeat(61) }),
      template({ note: 'n'.repeat(501) }),
      template({ amountMinor: 0 }),
      template({ amountMinor: Number.MAX_SAFE_INTEGER + 1 }),
      template({ amountMinor: '1000' }),
      template({ interval: 0 }),
      template({ interval: 1_000_000 }),
      template({ unexpected: true }),
    ]) {
      const res = await post(bad);
      expect(res.statusCode, JSON.stringify(bad).slice(0, 80)).toBe(400);
      expect(code(res)).toBe('VALIDATION_FAILED');
    }

    const suspend = (reason: string) =>
      call('POST', '/api/v1/admin/users/' + target.id + '/suspend', boss, { reason });
    expect((await suspend('r'.repeat(501))).statusCode).toBe(400);
    expect((await suspend('r'.repeat(500))).statusCode).toBe(200);

    const longEmail = 'a'.repeat(250) + '@example.com';
    expect(
      (await call('GET', '/api/v1/admin/audit-logs?actorEmail=' + longEmail, boss)).statusCode,
    ).toBe(400);
    expect((await call('GET', '/api/v1/admin/users?q=' + 'q'.repeat(101), boss)).statusCode).toBe(
      400,
    );
    expect((await call('GET', '/api/v1/admin/users?q=' + 'q'.repeat(100), boss)).statusCode).toBe(
      200,
    );
  });

  it('should not leak another user data through summary, trend or category breakdown', async () => {
    const alice = await registerUser(ctx.app, { currency: 'USD' });
    const bob = await registerUser(ctx.app, { currency: 'USD' });
    const aWallet = await createWallet(ctx.app, alice, {
      name: 'Alice secret wallet',
      currency: 'USD',
      openingBalanceMinor: 999_999,
    });
    const aCat = await systemCategory(ctx.app, alice, 'expense', 'Groceries');
    await createTransaction(ctx.app, alice, {
      type: 'expense',
      walletId: aWallet.id,
      categoryId: aCat.id,
      amountMinor: 12_345,
      occurredOn: '2026-10-05',
      note: 'alice private note',
    });
    await call('POST', '/api/v1/budgets', alice, { scope: 'overall', amountMinor: 50_000 });
    const range = 'from=2026-10-01&to=2026-10-31';
    for (const url of [
      '/api/v1/reports/summary?' + range,
      '/api/v1/reports/trend?' + range + '&currency=USD',
      '/api/v1/reports/category-breakdown?' + range + '&currency=USD',
    ]) {
      const res = await call('GET', url, bob);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).not.toMatch(/Alice|alice private|999999|12345|"Groceries"/);
    }
    const summary = (await call('GET', '/api/v1/reports/summary?' + range, bob)).json<{
      wallets: unknown[];
      recentTransactions: unknown[];
      budgets: unknown[];
    }>();
    expect(summary.wallets).toEqual([]);
    expect(summary.recentTransactions).toEqual([]);
    expect(summary.budgets).toEqual([]);
  });
});
