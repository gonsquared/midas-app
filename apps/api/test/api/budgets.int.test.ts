import { BudgetSchema, type Budget } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  createIntegrationContext,
  registerUser,
  type IntegrationContext,
  type TestUser,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createCategory,
  createTransaction,
  createTransfer,
  createWallet,
  expectLedgerConsistent,
  systemCategory,
} from '../support/ledger.js';

describeDb('budgets API (real PostgreSQL, E6-F1-S3 and S4)', () => {
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
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    user: TestUser,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: user.headers,
      ...(payload !== undefined && { payload: payload as object }),
    });

  const create = async (user: TestUser, body: Record<string, unknown>): Promise<Budget> => {
    const res = await call('POST', '/api/v1/budgets', user, body);
    if (res.statusCode !== 201) throw new Error(`create budget failed: ${res.body}`);
    return BudgetSchema.parse(res.json());
  };

  async function setup() {
    const user = await registerUser(ctx.app, { currency: 'USD' });
    const wallet = await createWallet(ctx.app, user, { name: 'Main', currency: 'USD' });
    const groceries = await systemCategory(ctx.app, user, 'expense', 'Groceries');
    const dining = await systemCategory(ctx.app, user, 'expense', 'Dining out');
    const salary = await systemCategory(ctx.app, user, 'income', 'Salary');
    const spend = (
      amountMinor: number,
      occurredOn: string,
      categoryId = groceries.id,
      walletId = wallet.id,
    ) =>
      createTransaction(ctx.app, user, {
        type: 'expense',
        walletId,
        categoryId,
        amountMinor,
        occurredOn,
      });
    return { user, wallet, groceries, dining, salary, spend };
  }

  it('creates an overall monthly budget with the contract defaults', async () => {
    const { user } = await setup();
    const budget = await create(user, { scope: 'overall', amountMinor: 100000 });
    expect(budget).toMatchObject({
      scope: 'overall',
      category: null,
      period: 'monthly',
      currency: 'USD',
      warningThresholdPct: 80,
      startDate: '2026-10-01',
      status: {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        spentMinor: 0,
        remainingMinor: 100000,
        percentUsed: 0,
        state: 'ok',
      },
    });
  });

  it('computes progress from expenses in the period only', async () => {
    const { user, wallet, groceries, salary, spend } = await setup();
    const savings = await createWallet(ctx.app, user, { name: 'Savings', currency: 'USD' });
    await spend(2500, '2026-10-02');
    await spend(1500, '2026-10-31');
    await spend(9999, '2026-09-30'); // previous month
    await spend(9999, '2026-11-01'); // next month
    await createTransaction(ctx.app, user, {
      type: 'income',
      walletId: wallet.id,
      categoryId: salary.id,
      amountMinor: 500000,
      occurredOn: '2026-10-05',
    });
    await createTransfer(ctx.app, user, {
      fromWalletId: wallet.id,
      toWalletId: savings.id,
      amountMinor: 7000,
      occurredOn: '2026-10-06',
    });
    const budget = await create(user, { scope: 'overall', amountMinor: 10000 });
    expect(budget.status).toMatchObject({
      spentMinor: 4000,
      remainingMinor: 6000,
      percentUsed: 40,
    });
    const scoped = await create(user, {
      scope: 'category',
      categoryId: groceries.id,
      amountMinor: 8000,
    });
    expect(scoped.category).toMatchObject({ id: groceries.id, name: 'Groceries', system: true });
    expect(scoped.status).toMatchObject({ spentMinor: 4000, percentUsed: 50 });
  });

  it('never mixes currencies', async () => {
    const { user, spend } = await setup();
    const euro = await createWallet(ctx.app, user, { name: 'Euro', currency: 'EUR' });
    await spend(1000, '2026-10-02');
    const groceries = await systemCategory(ctx.app, user, 'expense', 'Groceries');
    await createTransaction(ctx.app, user, {
      type: 'expense',
      walletId: euro.id,
      categoryId: groceries.id,
      amountMinor: 70000,
      occurredOn: '2026-10-03',
    });
    const usd = await create(user, { scope: 'overall', amountMinor: 50000 });
    const eur = await create(user, { scope: 'overall', amountMinor: 100000, currency: 'EUR' });
    expect(usd.status?.spentMinor).toBe(1000);
    expect(eur.status).toMatchObject({ spentMinor: 70000, percentUsed: 70, state: 'ok' });
  });

  it('counts archived wallets and retired categories, and ignores deleted transactions', async () => {
    const { user, wallet, groceries, spend } = await setup();
    const doomed = await spend(3000, '2026-10-03');
    await spend(2000, '2026-10-04');
    const budget = await create(user, {
      scope: 'category',
      categoryId: groceries.id,
      amountMinor: 10000,
    });
    expect(budget.status?.spentMinor).toBe(5000);

    await call('POST', `/api/v1/wallets/${wallet.id}/archive`, user);
    await ctx.owner.query(`update categories set retired_at = now() where id = $1`, [groceries.id]);
    const afterArchive = await call('GET', `/api/v1/budgets/${budget.id}`, user);
    expect(afterArchive.json<Budget>().status?.spentMinor).toBe(5000);
    expect(afterArchive.json<Budget>().category?.retired).toBe(true);

    await call('POST', `/api/v1/wallets/${wallet.id}/unarchive`, user);
    expect((await call('DELETE', `/api/v1/transactions/${doomed.id}`, user)).statusCode).toBe(204);
    const afterDelete = await call('GET', `/api/v1/budgets/${budget.id}`, user);
    expect(afterDelete.json<Budget>().status?.spentMinor).toBe(2000);
  });
});

describeDb('budget states, periods and rules (real PostgreSQL)', () => {
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

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    user: TestUser,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: user.headers,
      ...(payload !== undefined && { payload: payload as object }),
    });

  async function setup() {
    const user = await registerUser(ctx.app, { currency: 'USD' });
    const wallet = await createWallet(ctx.app, user, { name: 'Main', currency: 'USD' });
    const groceries = await systemCategory(ctx.app, user, 'expense', 'Groceries');
    const spend = (amountMinor: number, occurredOn: string) =>
      createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: groceries.id,
        amountMinor,
        occurredOn,
      });
    return { user, wallet, groceries, spend };
  }

  it('reports ok, warning and exceeded at the exact boundaries (E6-F1-S4)', async () => {
    const { user, spend } = await setup();
    const created = await call('POST', '/api/v1/budgets', user, {
      scope: 'overall',
      amountMinor: 10000,
      warningThresholdPct: 80,
    });
    const id = created.json<Budget>().id;
    const state = async () => (await call('GET', `/api/v1/budgets/${id}`, user)).json<Budget>();
    await spend(7999, '2026-10-01');
    expect((await state()).status).toMatchObject({ state: 'ok', percentUsed: 80 });
    await spend(1, '2026-10-02');
    expect((await state()).status).toMatchObject({ state: 'warning', spentMinor: 8000 });
    await spend(1999, '2026-10-03');
    expect((await state()).status).toMatchObject({ state: 'warning', spentMinor: 9999 });
    await spend(1, '2026-10-04');
    expect((await state()).status).toMatchObject({ state: 'exceeded', percentUsed: 100 });
    await spend(2000, '2026-10-05');
    expect((await state()).status).toMatchObject({
      state: 'exceeded',
      remainingMinor: -2000,
      percentUsed: 120,
    });
  });

  it('honours a custom threshold and applies limit edits retroactively', async () => {
    const { user, spend } = await setup();
    const budget = (
      await call('POST', '/api/v1/budgets', user, {
        scope: 'overall',
        amountMinor: 10000,
        warningThresholdPct: 50,
        startDate: '2026-08-01',
      })
    ).json<Budget>();
    await spend(5000, '2026-10-01');
    expect(
      (await call('GET', `/api/v1/budgets/${budget.id}`, user)).json<Budget>().status?.state,
    ).toBe('warning');
    const raised = await call('PATCH', `/api/v1/budgets/${budget.id}`, user, {
      amountMinor: 20000,
    });
    expect(raised.json<Budget>().status).toMatchObject({ state: 'ok', percentUsed: 25 });
    const past = await call('GET', `/api/v1/budgets/${budget.id}?date=2026-09-15`, user);
    expect(past.json<Budget>().status).toMatchObject({ periodStart: '2026-09-01', spentMinor: 0 });
    // Before its start date a budget has no status for the period (api-contract 2.14).
    const before = await call('GET', `/api/v1/budgets/${budget.id}?date=2026-07-15`, user);
    expect(before.json<Budget>().status).toBeNull();
  });

  it('lists budgets for the period of a date and hides those that start later', async () => {
    const { user, spend } = await setup();
    await spend(1000, '2026-09-10');
    await call('POST', '/api/v1/budgets', user, { scope: 'overall', amountMinor: 5000 });
    const september = await call('GET', '/api/v1/budgets?date=2026-09-20', user);
    expect(september.json()).toMatchObject({ date: '2026-09-20', items: [] });
    const october = await call('GET', '/api/v1/budgets?date=2026-10-20', user);
    expect(october.json<{ items: Budget[] }>().items).toHaveLength(1);
    const early = await call('GET', '/api/v1/budgets?date=2026-09-20', user);
    expect(early.statusCode).toBe(200);
    const id = october.json<{ items: Budget[] }>().items[0]?.id;
    const single = await call('GET', `/api/v1/budgets/${id}?date=2026-09-20`, user);
    expect(single.json<Budget>().status).toBeNull();
  });

  it('normalizes the start date to ISO weeks, months and years', async () => {
    const { user } = await setup();
    const weekly = (
      await call('POST', '/api/v1/budgets', user, {
        scope: 'overall',
        period: 'weekly',
        amountMinor: 100,
        startDate: '2026-10-21',
      })
    ).json<Budget>();
    expect(weekly.startDate).toBe('2026-10-19');
    // Today (Sunday 18 October) is in the week before the start, so there is no status yet.
    expect(weekly.status).toBeNull();
    const later = await call('GET', `/api/v1/budgets/${weekly.id}?date=2026-10-20`, user);
    expect(later.json<Budget>().status).toMatchObject({
      periodStart: '2026-10-19',
      periodEnd: '2026-10-25',
    });
    const yearly = (
      await call('POST', '/api/v1/budgets', user, {
        scope: 'overall',
        period: 'yearly',
        amountMinor: 100,
        startDate: '2026-06-15',
      })
    ).json<Budget>();
    expect(yearly.startDate).toBe('2026-01-01');
    const edited = await call('PATCH', `/api/v1/budgets/${yearly.id}`, user, {
      startDate: '2025-08-20',
    });
    expect(edited.json<Budget>().startDate).toBe('2025-01-01');
  });

  it('uses the time zone of the user for "today"', async () => {
    ctx.clock.set(new Date('2026-10-31T20:00:00.000Z')); // already 1 November in Auckland
    const { user } = await setup();
    await call('PATCH', '/api/v1/me', user, { preferences: { timezone: 'Pacific/Auckland' } });
    const budget = (
      await call('POST', '/api/v1/budgets', user, { scope: 'overall', amountMinor: 100 })
    ).json<Budget>();
    expect(budget.startDate).toBe('2026-11-01');
    expect(budget.status?.periodStart).toBe('2026-11-01');
    expect((await call('GET', '/api/v1/budgets', user)).json()).toMatchObject({
      date: '2026-11-01',
    });
  });
});

describeDb('budget validation, ownership and limits (real PostgreSQL)', () => {
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

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    user: TestUser,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: user.headers,
      ...(payload !== undefined && { payload: payload as object }),
    });
  const code = (res: { json: () => unknown }) => (res.json() as { code: string }).code;
  const MISSING = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';

  it('rejects a second budget for the same scope, category, period and currency', async () => {
    const user = await registerUser(ctx.app);
    const cat = await systemCategory(ctx.app, user, 'expense');
    const body = { scope: 'category', categoryId: cat.id, amountMinor: 100 };
    expect((await call('POST', '/api/v1/budgets', user, body)).statusCode).toBe(201);
    const dup = await call('POST', '/api/v1/budgets', user, { ...body, amountMinor: 999 });
    expect(dup.statusCode).toBe(409);
    expect(code(dup)).toBe('BUDGET_EXISTS');
    const weekly = await call('POST', '/api/v1/budgets', user, { ...body, period: 'weekly' });
    expect(weekly.statusCode).toBe(201);
    const euro = await call('POST', '/api/v1/budgets', user, { ...body, currency: 'EUR' });
    expect(euro.statusCode).toBe(201);
    const overall = { scope: 'overall', amountMinor: 100 };
    expect((await call('POST', '/api/v1/budgets', user, overall)).statusCode).toBe(201);
    expect(code(await call('POST', '/api/v1/budgets', user, overall))).toBe('BUDGET_EXISTS');
  });

  it('validates the category: type, retired, unknown and other users', async () => {
    const user = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    const income = await systemCategory(ctx.app, user, 'income');
    const retired = await systemCategory(ctx.app, user, 'expense', 'Fuel');
    await ctx.owner.query('update categories set retired_at = now() where id = $1', [retired.id]);
    const foreign = await createCategory(ctx.app, other, { name: 'Secret' });
    const post = (categoryId: string) =>
      call('POST', '/api/v1/budgets', user, { scope: 'category', categoryId, amountMinor: 1 });
    expect(code(await post(income.id))).toBe('CATEGORY_TYPE_MISMATCH');
    expect(code(await post(retired.id))).toBe('CATEGORY_RETIRED');
    const unknown = await post(MISSING);
    expect(unknown.statusCode).toBe(422);
    expect(code(unknown)).toBe('INVALID_REFERENCE');
    expect(code(await post(foreign.id))).toBe('INVALID_REFERENCE');
  });

  it('returns 404 for other users budgets on read, update and delete (IDOR)', async () => {
    const owner = await registerUser(ctx.app);
    const intruder = await registerUser(ctx.app);
    const budget = (
      await call('POST', '/api/v1/budgets', owner, { scope: 'overall', amountMinor: 500 })
    ).json<Budget>();
    for (const [method, payload] of [
      ['GET', undefined],
      ['PATCH', { amountMinor: 1 }],
      ['DELETE', undefined],
    ] as const) {
      const res = await call(method, `/api/v1/budgets/${budget.id}`, intruder, payload);
      expect(res.statusCode, method).toBe(404);
      expect(code(res)).toBe('NOT_FOUND');
    }
    const list = await call('GET', '/api/v1/budgets', intruder);
    expect(list.json<{ items: Budget[] }>().items).toEqual([]);
    const intact = await call('GET', `/api/v1/budgets/${budget.id}`, owner);
    expect(intact.json<Budget>().amountMinor).toBe(500);
  });
});

describeDb('budget request hygiene (real PostgreSQL)', () => {
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

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    user: TestUser,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: user.headers,
      ...(payload !== undefined && { payload: payload as object }),
    });
  const code = (res: { json: () => unknown }) => (res.json() as { code: string }).code;

  it('enforces strict bodies: no mass assignment and immutable fields', async () => {
    const user = await registerUser(ctx.app);
    const budget = (
      await call('POST', '/api/v1/budgets', user, { scope: 'overall', amountMinor: 500 })
    ).json<Budget>();
    const id = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';
    const bad = [
      { scope: 'overall', amountMinor: 5, userId: user.id },
      { scope: 'overall', amountMinor: 5.5 },
      { scope: 'overall', amountMinor: '5' },
      { scope: 'category', amountMinor: 5 },
      { scope: 'overall', amountMinor: 5, categoryId: id },
      { scope: 'overall', amountMinor: 5, warningThresholdPct: 100 },
      { scope: 'overall', amountMinor: 100_000_000_000_001 },
      { scope: 'overall', amountMinor: 5, period: 'daily' },
      { scope: 'overall', amountMinor: 5, currency: 'XXX' },
    ];
    for (const body of bad) {
      const res = await call('POST', '/api/v1/budgets', user, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(code(res)).toBe('VALIDATION_FAILED');
    }
    const immutable = [{ scope: 'category' }, { currency: 'EUR' }, { period: 'weekly' }];
    for (const body of [...immutable, { categoryId: null }]) {
      const res = await call('PATCH', `/api/v1/budgets/${budget.id}`, user, body);
      expect(res.statusCode).toBe(400);
    }
    expect((await call('GET', '/api/v1/budgets?date=2026-13-01', user)).statusCode).toBe(400);
    expect((await call('GET', '/api/v1/budgets/not-a-uuid', user)).statusCode).toBe(400);
  });

  it('caps a user at 200 budgets', async () => {
    const user = await registerUser(ctx.app);
    await ctx.owner.query(
      `insert into budgets (user_id, scope, period, amount_minor, currency, start_date)
       select $1, 'overall', 'monthly', 100,
              chr(65 + g / 676) || chr(65 + (g / 26) % 26) || chr(65 + g % 26), date '2026-10-01'
         from generate_series(1, 200) g`,
      [user.id],
    );
    const res = await call('POST', '/api/v1/budgets', user, { scope: 'overall', amountMinor: 100 });
    expect(res.statusCode).toBe(409);
    expect(code(res)).toBe('LIMIT_REACHED');
  });

  it('requires authentication on every budget route', async () => {
    const missing = '/api/v1/budgets/0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';
    for (const [method, url] of [
      ['GET', '/api/v1/budgets'],
      ['POST', '/api/v1/budgets'],
      ['GET', missing],
      ['PATCH', missing],
      ['DELETE', missing],
    ] as const) {
      const res = await ctx.app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('deletes a budget, and category budgets go with a deleted category', async () => {
    const user = await registerUser(ctx.app);
    const mine = await createCategory(ctx.app, user, { name: 'Hobbies' });
    const scoped = { scope: 'category', categoryId: mine.id, amountMinor: 100 };
    const budget = (await call('POST', '/api/v1/budgets', user, scoped)).json<Budget>();
    const removed = await call('DELETE', `/api/v1/categories/${mine.id}`, user);
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ deletedBudgets: 1, reassignedTemplates: 0 });
    expect((await call('GET', `/api/v1/budgets/${budget.id}`, user)).statusCode).toBe(404);
    const overall = { scope: 'overall', amountMinor: 1 };
    const plain = (await call('POST', '/api/v1/budgets', user, overall)).json<Budget>();
    expect((await call('DELETE', `/api/v1/budgets/${plain.id}`, user)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/v1/budgets/${plain.id}`, user)).statusCode).toBe(404);
  });
});
