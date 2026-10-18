import {
  ReportCategoryBreakdownSchema,
  ReportSummarySchema,
  ReportTrendSchema,
  type ReportCategoryBreakdown,
  type ReportSummary,
  type ReportTrend,
} from '@midas/shared';
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

describeDb('reports API (real PostgreSQL, E7-F1)', () => {
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

  const get = (url: string, user: TestUser) =>
    ctx.app.inject({ method: 'GET', url, headers: user.headers });

  async function setup() {
    const user = await registerUser(ctx.app, { currency: 'USD' });
    const usd = await createWallet(ctx.app, user, {
      name: 'Main',
      currency: 'USD',
      openingBalanceMinor: 100000,
    });
    const savings = await createWallet(ctx.app, user, { name: 'Savings', currency: 'USD' });
    const euro = await createWallet(ctx.app, user, { name: 'Euro', currency: 'EUR' });
    const cats = {
      groceries: await systemCategory(ctx.app, user, 'expense', 'Groceries'),
      dining: await systemCategory(ctx.app, user, 'expense', 'Dining out'),
      housing: await systemCategory(ctx.app, user, 'expense', 'Housing'),
      salary: await systemCategory(ctx.app, user, 'income', 'Salary'),
    };
    const tx = (
      type: 'income' | 'expense',
      walletId: string,
      categoryId: string,
      amountMinor: number,
      occurredOn: string,
    ) => createTransaction(ctx.app, user, { type, walletId, categoryId, amountMinor, occurredOn });
    return { user, usd, savings, euro, cats, tx };
  }

  it('summarizes balances and period totals per currency, excluding transfers', async () => {
    const { user, usd, savings, euro, cats, tx } = await setup();
    await tx('income', usd.id, cats.salary.id, 300000, '2026-10-01');
    await tx('expense', usd.id, cats.groceries.id, 12000, '2026-10-05');
    await tx('expense', usd.id, cats.dining.id, 3000, '2026-09-30'); // outside the range
    await tx('expense', euro.id, cats.groceries.id, 4500, '2026-10-06');
    await createTransfer(ctx.app, user, {
      fromWalletId: usd.id,
      toWalletId: savings.id,
      amountMinor: 50000,
      occurredOn: '2026-10-07',
    });
    const res = await get('/api/v1/reports/summary', user);
    expect(res.statusCode).toBe(200);
    const summary = ReportSummarySchema.parse(res.json()) as ReportSummary;
    expect(summary.from).toBe('2026-10-01');
    expect(summary.to).toBe('2026-10-31');
    expect(summary.wallets.map((w) => w.name).sort()).toEqual(['Euro', 'Main', 'Savings']);
    expect(summary.totalsByCurrency).toEqual([
      { currency: 'EUR', balanceMinor: -4500, incomeMinor: 0, expenseMinor: 4500, netMinor: -4500 },
      {
        currency: 'USD',
        // 100000 opening + 300000 - 12000 - 3000 - 50000 (out) + 50000 (in)
        balanceMinor: 385000,
        incomeMinor: 300000,
        expenseMinor: 12000,
        netMinor: 288000,
      },
    ]);
  });

  it('lists up to ten recent transactions of the range and budget status for its last period', async () => {
    const { user, usd, cats, tx } = await setup();
    for (let day = 1; day <= 12; day++) {
      await tx(
        'expense',
        usd.id,
        cats.groceries.id,
        100 * day,
        `2026-10-${String(day).padStart(2, '0')}`,
      );
    }
    await tx('expense', usd.id, cats.groceries.id, 5000, '2026-09-20');
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/budgets',
      headers: user.headers,
      payload: { scope: 'overall', amountMinor: 10000 },
    });
    const summary = (
      await get('/api/v1/reports/summary?from=2026-10-01&to=2026-10-31', user)
    ).json<ReportSummary>();
    expect(summary.recentTransactions).toHaveLength(10);
    expect(summary.recentTransactions.map((t) => t.occurredOn)).toEqual(
      [12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((d) => `2026-10-${String(d).padStart(2, '0')}`),
    );
    expect(summary.budgets).toHaveLength(1);
    expect(summary.budgets[0]?.status).toMatchObject({
      spentMinor: 7800,
      percentUsed: 78,
      state: 'ok',
    });
    // Budget status follows the period that contains `to`.
    const september = (
      await get('/api/v1/reports/summary?from=2026-09-01&to=2026-09-30', user)
    ).json<ReportSummary>();
    expect(september.budgets).toEqual([]);
  });

  it('keeps archived wallets out of balances but their activity in the totals', async () => {
    const { user, usd, savings, cats, tx } = await setup();
    await tx('expense', savings.id, cats.groceries.id, 700, '2026-10-02');
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/wallets/${savings.id}/archive`,
      headers: user.headers,
    });
    const summary = (await get('/api/v1/reports/summary', user)).json<ReportSummary>();
    expect(summary.wallets.map((w) => w.id)).not.toContain(savings.id);
    const usdTotals = summary.totalsByCurrency.find((t) => t.currency === 'USD');
    expect(usdTotals).toMatchObject({ balanceMinor: 100000, expenseMinor: 700 });
    expect(usd.id).toBeDefined();
  });

  it('validates the range: inverted, malformed, and larger than 1830 days', async () => {
    const { user } = await setup();
    const inverted = await get('/api/v1/reports/summary?from=2026-10-10&to=2026-10-01', user);
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await get('/api/v1/reports/summary?from=2026-02-30', user)).statusCode).toBe(400);
    expect((await get('/api/v1/reports/summary?bogus=1', user)).statusCode).toBe(400);
    // 2021-01-01 through 2026-01-04 is exactly 1830 days; one more day is too large.
    const exact = await get('/api/v1/reports/summary?from=2021-01-01&to=2026-01-04', user);
    expect(exact.statusCode).toBe(200);
    const tooLarge = await get('/api/v1/reports/summary?from=2021-01-01&to=2026-01-05', user);
    expect(tooLarge.statusCode).toBe(400);
    expect(tooLarge.json()).toMatchObject({ code: 'RANGE_TOO_LARGE' });
  });
});

describeDb('trend and category breakdown (real PostgreSQL, E7-F1-S2 and S3)', () => {
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

  const get = (url: string, user: TestUser) =>
    ctx.app.inject({ method: 'GET', url, headers: user.headers });

  async function setup() {
    const user = await registerUser(ctx.app, { currency: 'USD' });
    const usd = await createWallet(ctx.app, user, { name: 'Main', currency: 'USD' });
    const savings = await createWallet(ctx.app, user, { name: 'Savings', currency: 'USD' });
    const euro = await createWallet(ctx.app, user, { name: 'Euro', currency: 'EUR' });
    const groceries = await systemCategory(ctx.app, user, 'expense', 'Groceries');
    const dining = await systemCategory(ctx.app, user, 'expense', 'Dining out');
    const salary = await systemCategory(ctx.app, user, 'income', 'Salary');
    const tx = (
      type: 'income' | 'expense',
      walletId: string,
      categoryId: string,
      amountMinor: number,
      occurredOn: string,
    ) => createTransaction(ctx.app, user, { type, walletId, categoryId, amountMinor, occurredOn });
    return { user, usd, savings, euro, groceries, dining, salary, tx };
  }

  it('returns every day of a short range, empty days as zeros', async () => {
    const { user, usd, groceries, salary, tx } = await setup();
    await tx('expense', usd.id, groceries.id, 1500, '2026-10-02');
    await tx('expense', usd.id, groceries.id, 500, '2026-10-02');
    await tx('income', usd.id, salary.id, 9000, '2026-10-04');
    const res = await get('/api/v1/reports/trend?from=2026-10-01&to=2026-10-05', user);
    expect(res.statusCode).toBe(200);
    const trend = ReportTrendSchema.parse(res.json()) as ReportTrend;
    expect(trend).toMatchObject({ groupBy: 'day', currency: 'USD' });
    expect(trend.buckets).toEqual([
      {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-01',
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
      },
      {
        periodStart: '2026-10-02',
        periodEnd: '2026-10-02',
        incomeMinor: 0,
        expenseMinor: 2000,
        netMinor: -2000,
      },
      {
        periodStart: '2026-10-03',
        periodEnd: '2026-10-03',
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
      },
      {
        periodStart: '2026-10-04',
        periodEnd: '2026-10-04',
        incomeMinor: 9000,
        expenseMinor: 0,
        netMinor: 9000,
      },
      {
        periodStart: '2026-10-05',
        periodEnd: '2026-10-05',
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
      },
    ]);
  });

  it('defaults to the current month, picks week or month for longer ranges, groups by Monday weeks', async () => {
    const { user, usd, groceries, tx } = await setup();
    await tx('expense', usd.id, groceries.id, 100, '2026-10-12'); // Monday
    await tx('expense', usd.id, groceries.id, 200, '2026-10-18'); // Sunday of the same week
    await tx('expense', usd.id, groceries.id, 400, '2026-10-19'); // next Monday
    const month = (await get('/api/v1/reports/trend', user)).json<ReportTrend>();
    expect(month).toMatchObject({ from: '2026-10-01', to: '2026-10-31', groupBy: 'day' });
    expect(month.buckets).toHaveLength(31);
    const weeks = (
      await get('/api/v1/reports/trend?from=2026-09-01&to=2026-12-31', user)
    ).json<ReportTrend>();
    expect(weeks.groupBy).toBe('week');
    const w = weeks.buckets.filter((b) => b.expenseMinor > 0);
    expect(w.map((b) => [b.periodStart, b.expenseMinor])).toEqual([
      ['2026-10-12', 300],
      ['2026-10-19', 400],
    ]);
    const months = (
      await get('/api/v1/reports/trend?from=2026-01-01&to=2026-12-31', user)
    ).json<ReportTrend>();
    expect(months.groupBy).toBe('month');
    expect(months.buckets).toHaveLength(12);
    expect(months.buckets[9]).toMatchObject({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      expenseMinor: 700,
    });
    const forced = (
      await get('/api/v1/reports/trend?from=2026-10-01&to=2026-10-31&groupBy=month', user)
    ).json<ReportTrend>();
    expect(forced.buckets).toHaveLength(1);
  });

  it('is per currency, excludes transfers, and never includes other users', async () => {
    const { user, usd, savings, euro, groceries, tx } = await setup();
    await tx('expense', usd.id, groceries.id, 1000, '2026-10-02');
    await tx('expense', euro.id, groceries.id, 777, '2026-10-02');
    await createTransfer(ctx.app, user, {
      fromWalletId: usd.id,
      toWalletId: savings.id,
      amountMinor: 5000,
      occurredOn: '2026-10-02',
    });
    const other = await registerUser(ctx.app);
    const otherWallet = await createWallet(ctx.app, other, { currency: 'USD' });
    await createTransaction(ctx.app, other, {
      type: 'expense',
      walletId: otherWallet.id,
      categoryId: groceries.id,
      amountMinor: 424242,
      occurredOn: '2026-10-02',
    });
    const q = '?from=2026-10-02&to=2026-10-02';
    const usdDay = (await get(`/api/v1/reports/trend${q}`, user)).json<ReportTrend>();
    expect(usdDay.buckets).toHaveLength(1);
    expect(usdDay.buckets[0]).toMatchObject({ expenseMinor: 1000, incomeMinor: 0 });
    const eurDay = (await get(`/api/v1/reports/trend${q}&currency=EUR`, user)).json<ReportTrend>();
    expect(eurDay.buckets[0]).toMatchObject({ expenseMinor: 777 });
  });

  it('rejects more than 400 buckets and bad parameters', async () => {
    const { user } = await setup();
    const ok = await get('/api/v1/reports/trend?from=2026-01-01&to=2027-02-04&groupBy=day', user);
    expect(ok.statusCode).toBe(200);
    expect(ok.json<ReportTrend>().buckets).toHaveLength(400);
    const big = await get('/api/v1/reports/trend?from=2026-01-01&to=2027-02-05&groupBy=day', user);
    expect(big.statusCode).toBe(400);
    expect(big.json()).toMatchObject({ code: 'RANGE_TOO_LARGE' });
    for (const query of ['groupBy=year', 'currency=usd', 'currency=ZZZ', 'from=nope', 'x=1']) {
      expect((await get(`/api/v1/reports/trend?${query}`, user)).statusCode, query).toBe(400);
    }
  });
});

describeDb('category breakdown (real PostgreSQL, E7-F1-S3)', () => {
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

  const get = (url: string, user: TestUser) =>
    ctx.app.inject({ method: 'GET', url, headers: user.headers });

  async function setup() {
    const user = await registerUser(ctx.app, { currency: 'USD' });
    const usd = await createWallet(ctx.app, user, { name: 'Main', currency: 'USD' });
    const savings = await createWallet(ctx.app, user, { name: 'Savings', currency: 'USD' });
    const euro = await createWallet(ctx.app, user, { name: 'Euro', currency: 'EUR' });
    const spend = (
      categoryId: string,
      amountMinor: number,
      walletId = usd.id,
      day = '2026-10-05',
    ) =>
      createTransaction(ctx.app, user, {
        type: 'expense',
        walletId,
        categoryId,
        amountMinor,
        occurredOn: day,
      });
    return { user, usd, savings, euro, spend };
  }

  it('returns totals, percentages and counts per category, largest first', async () => {
    const { user, spend } = await setup();
    const groceries = await systemCategory(ctx.app, user, 'expense', 'Groceries');
    const dining = await systemCategory(ctx.app, user, 'expense', 'Dining out');
    await spend(groceries.id, 6000);
    await spend(groceries.id, 2000);
    await spend(dining.id, 2000);
    const res = await get('/api/v1/reports/category-breakdown', user);
    expect(res.statusCode).toBe(200);
    const report = ReportCategoryBreakdownSchema.parse(res.json()) as ReportCategoryBreakdown;
    expect(report).toMatchObject({
      type: 'expense',
      currency: 'USD',
      totalMinor: 10000,
      other: null,
    });
    expect(
      report.items.map((i) => [i.category.name, i.amountMinor, i.percentage, i.transactionCount]),
    ).toEqual([
      ['Groceries', 8000, 80, 2],
      ['Dining out', 2000, 20, 1],
    ]);
  });

  it('groups the tail into "other" and keeps percentages summing to exactly 100.00', async () => {
    const { user, spend } = await setup();
    const names = ['Groceries', 'Dining out', 'Housing', 'Utilities', 'Health'];
    for (const [index, name] of names.entries()) {
      const category = await systemCategory(ctx.app, user, 'expense', name);
      await spend(category.id, 3333 - index * 7);
    }
    const report = (
      await get('/api/v1/reports/category-breakdown?top=3', user)
    ).json<ReportCategoryBreakdown>();
    expect(report.items).toHaveLength(3);
    expect(report.other).toMatchObject({ categoryCount: 2 });
    expect(report.items.map((i) => i.amountMinor)).toEqual([3333, 3326, 3319]);
    const sum = [...report.items.map((i) => i.percentage), report.other?.percentage ?? 0].reduce(
      (total, p) => total + Math.round(p * 100),
      0,
    );
    expect(sum).toBe(10_000);
    expect(report.totalMinor).toBe(3333 + 3326 + 3319 + 3312 + 3305);
    expect(report.other?.amountMinor).toBe(3312 + 3305);
  });

  it('excludes transfers and other currencies, supports income, and handles an empty range', async () => {
    const { user, usd, savings, euro, spend } = await setup();
    const groceries = await systemCategory(ctx.app, user, 'expense', 'Groceries');
    const salary = await systemCategory(ctx.app, user, 'income', 'Salary');
    await spend(groceries.id, 1000);
    await spend(groceries.id, 999, euro.id);
    await createTransfer(ctx.app, user, {
      fromWalletId: usd.id,
      toWalletId: savings.id,
      amountMinor: 70000,
      occurredOn: '2026-10-05',
    });
    await createTransaction(ctx.app, user, {
      type: 'income',
      walletId: usd.id,
      categoryId: salary.id,
      amountMinor: 5000,
      occurredOn: '2026-10-05',
    });
    const expense = (
      await get('/api/v1/reports/category-breakdown', user)
    ).json<ReportCategoryBreakdown>();
    expect(expense.totalMinor).toBe(1000);
    const eur = (
      await get('/api/v1/reports/category-breakdown?currency=EUR', user)
    ).json<ReportCategoryBreakdown>();
    expect(eur.totalMinor).toBe(999);
    const income = (
      await get('/api/v1/reports/category-breakdown?type=income', user)
    ).json<ReportCategoryBreakdown>();
    expect(income.items.map((i) => i.category.name)).toEqual(['Salary']);
    const empty = (
      await get('/api/v1/reports/category-breakdown?from=2020-01-01&to=2020-01-31', user)
    ).json<ReportCategoryBreakdown>();
    expect(empty).toMatchObject({ totalMinor: 0, items: [], other: null });
  });

  it('flags retired categories, includes user categories, and validates parameters', async () => {
    const { user, spend } = await setup();
    const mine = await createCategory(ctx.app, user, { name: 'Hobbies' });
    await spend(mine.id, 400);
    const fuel = await systemCategory(ctx.app, user, 'expense', 'Fuel');
    await spend(fuel.id, 600);
    await ctx.owner.query('update categories set retired_at = now() where id = $1', [fuel.id]);
    const report = (
      await get('/api/v1/reports/category-breakdown', user)
    ).json<ReportCategoryBreakdown>();
    expect(report.items.find((i) => i.category.name === 'Fuel')?.category).toMatchObject({
      system: true,
      retired: true,
    });
    expect(report.items.find((i) => i.category.name === 'Hobbies')?.category).toMatchObject({
      system: false,
    });
    const bad = [
      'top=0',
      'top=21',
      'top=x',
      'type=transfer',
      'from=2020-01-01&to=2026-12-31',
      'q=1',
    ];
    const codes = [] as number[];
    for (const query of bad)
      codes.push((await get(`/api/v1/reports/category-breakdown?${query}`, user)).statusCode);
    expect(codes).toEqual([400, 400, 400, 400, 400, 400]);
    const anon = await ctx.app.inject({ method: 'GET', url: '/api/v1/reports/category-breakdown' });
    expect(anon.statusCode).toBe(401);
  });
});
