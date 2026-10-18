import type { Transaction } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createCategory,
  createTransaction,
  createTransfer,
  createWallet,
  expectLedgerConsistent,
  systemCategory,
} from '../support/ledger.js';

const BOM = '﻿';

/** Minimal RFC 4180 parser for assertions. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += char;
  }
  return rows;
}

describeDb('CSV export (real PostgreSQL, E5-F3-S1)', () => {
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
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });

  const exportCsv = (headers: Record<string, string>, query = '') =>
    ctx.app.inject({ method: 'GET', url: `/api/v1/transactions/export${query}`, headers });

  async function seed() {
    const user = await registerUser(ctx.app);
    const checking = await createWallet(ctx.app, user, { name: 'Checking', currency: 'USD' });
    const savings = await createWallet(ctx.app, user, { name: 'Savings', currency: 'USD' });
    const euro = await createWallet(ctx.app, user, { name: 'Euro', currency: 'EUR' });
    const groceries = await systemCategory(ctx.app, user, 'expense', 'Groceries');
    const salary = await systemCategory(ctx.app, user, 'income', 'Salary');
    const evil = await createCategory(ctx.app, user, { name: '=SUM(A1:A9)', type: 'expense' });
    await createTransaction(ctx.app, user, {
      type: 'expense',
      walletId: checking.id,
      categoryId: groceries.id,
      amountMinor: 1250,
      occurredOn: '2026-10-02',
      note: 'weekly, "bulk" shop',
    });
    await createTransaction(ctx.app, user, {
      type: 'income',
      walletId: checking.id,
      categoryId: salary.id,
      amountMinor: 300000,
      occurredOn: '2026-10-01',
    });
    await createTransaction(ctx.app, user, {
      type: 'expense',
      walletId: euro.id,
      categoryId: evil.id,
      amountMinor: 999,
      occurredOn: '2026-10-03',
      note: '=HYPERLINK("http://evil.example","click")',
    });
    const transfer = await createTransfer(ctx.app, user, {
      fromWalletId: checking.id,
      toWalletId: savings.id,
      amountMinor: 5000,
      occurredOn: '2026-10-04',
    });
    return { user, checking, savings, euro, groceries, salary, evil, transfer };
  }

  it('returns a streamed UTF-8 CSV with BOM, header and attachment headers', async () => {
    const { user } = await seed();
    const res = await exportCsv(user.headers);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="midas-transactions-\d{8}\.csv"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.startsWith(BOM)).toBe(true);
    const rows = parseCsv(res.body.slice(1));
    expect(rows[0]).toEqual([
      'date',
      'type',
      'direction',
      'wallet',
      'currency',
      'amount',
      'category',
      'note',
      'counterpart_wallet',
      'transaction_id',
      'transfer_id',
      'recurring_template_id',
    ]);
    expect(rows).toHaveLength(1 + 5);
  });

  it('writes signed decimal amounts, transfer legs and the counterpart wallet', async () => {
    const { user, transfer } = await seed();
    const rows = parseCsv((await exportCsv(user.headers, '?sort=date_asc')).body.slice(1)).slice(1);
    const byType = (type: string) => rows.filter((r) => r[1] === type);
    expect(rows.map((r) => r[0])).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-04',
    ]);
    expect(byType('income')[0]?.[5]).toBe('3000.00');
    expect(byType('expense').map((r) => r[5])).toEqual(['-12.50', '-9.99']);
    const legs = byType('transfer');
    const out = legs.find((r) => r[2] === 'out');
    const incoming = legs.find((r) => r[2] === 'in');
    expect(out).toMatchObject({ 3: 'Checking', 5: '-50.00', 6: '', 8: 'Savings', 10: transfer.id });
    expect(incoming).toMatchObject({ 3: 'Savings', 5: '50.00', 8: 'Checking', 10: transfer.id });
    expect(byType('expense')[1]?.[4]).toBe('EUR');
  });

  it('protects text cells against formula injection and quotes awkward text', async () => {
    const { user } = await seed();
    const text = (await exportCsv(user.headers, '?sort=date_asc')).body.slice(1);
    const rows = parseCsv(text).slice(1);
    const evil = rows.find((r) => r[1] === 'expense' && r[4] === 'EUR');
    expect(evil?.[6]).toBe("'=SUM(A1:A9)");
    expect(evil?.[7]).toBe(`'=HYPERLINK("http://evil.example","click")`);
    const shop = rows.find((r) => r[7]?.includes('bulk'));
    expect(shop?.[7]).toBe('weekly, "bulk" shop');
    // The raw text really is quoted, not just parsed leniently.
    expect(text).toContain('"weekly, ""bulk"" shop"');
    // The numeric amount column is never prefixed, even when negative.
    expect(rows.every((r) => !(r[5] ?? '').startsWith("'"))).toBe(true);
  });
});

describeDb('CSV export filters, ownership and limits (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_REGISTER_MAX: '200',
    });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
  });

  const get = (url: string, headers: Record<string, string> = {}) =>
    ctx.app.inject({ method: 'GET', url, headers });
  const ids = (csv: string) =>
    parseCsv(csv.slice(1))
      .slice(1)
      .map((r) => r[9]);

  async function seedMany() {
    const user = await registerUser(ctx.app);
    const a = await createWallet(ctx.app, user, { name: 'A', currency: 'USD' });
    const b = await createWallet(ctx.app, user, { name: 'B', currency: 'USD' });
    const cat = await systemCategory(ctx.app, user, 'expense');
    const inc = await systemCategory(ctx.app, user, 'income');
    for (let i = 1; i <= 6; i++) {
      await createTransaction(ctx.app, user, {
        type: i % 3 === 0 ? 'income' : 'expense',
        walletId: i % 2 === 0 ? a.id : b.id,
        categoryId: i % 3 === 0 ? inc.id : cat.id,
        amountMinor: i * 100,
        occurredOn: `2026-09-0${i}`,
        note: i === 4 ? 'coffee beans' : null,
      });
    }
    return { user, a, b, cat };
  }

  it('honours exactly the same filters and sort as the list endpoint', async () => {
    const { user, a, cat } = await seedMany();
    const queries = [
      `walletId=${a.id}`,
      `categoryId=${cat.id}&sort=amount_desc`,
      'type=income',
      'q=COFFEE',
      'from=2026-09-02&to=2026-09-05&sort=date_asc',
      'minAmountMinor=200&maxAmountMinor=500&sort=amount_asc',
    ];
    for (const query of queries) {
      const list = await get(`/api/v1/transactions?${query}&limit=100`, user.headers);
      const expected = list.json<{ items: Transaction[] }>().items.map((t) => t.id);
      const exported = await get(`/api/v1/transactions/export?${query}`, user.headers);
      expect(exported.statusCode, query).toBe(200);
      expect(ids(exported.body), query).toEqual(expected);
    }
  });

  it('never includes another user and treats a foreign wallet filter as no match', async () => {
    const mine = await seedMany();
    const other = await seedMany();
    const all = await get('/api/v1/transactions/export', mine.user.headers);
    expect(ids(all.body)).toHaveLength(6);
    expect(all.body).not.toContain(other.a.id);
    const foreign = await get(
      `/api/v1/transactions/export?walletId=${other.a.id}`,
      mine.user.headers,
    );
    expect(foreign.statusCode).toBe(200);
    expect(ids(foreign.body)).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await get('/api/v1/transactions/export');
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it.each([
    'limit=10',
    'cursor=abc',
    'from=2026-02-30',
    'from=2026-03-01&to=2026-02-01',
    'sort=password_asc',
    'minAmountMinor=5&maxAmountMinor=1',
    'walletId=not-a-uuid',
    'unknown=1',
    'format=xml',
  ])('rejects the invalid query %s with 400 and a problem body', async (query) => {
    const { user } = await seedMany();
    const res = await get(`/api/v1/transactions/export?${query}`, user.headers);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('does not treat "export" as a transaction id', async () => {
    const { user } = await seedMany();
    const res = await get('/api/v1/transactions/export', user.headers);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('is limited to 10 exports per minute per user, with Retry-After', async () => {
    const { user } = await seedMany();
    const other = await registerUser(ctx.app);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++)
      codes.push((await get('/api/v1/transactions/export', user.headers)).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    const limited = await get('/api/v1/transactions/export', user.headers);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
    // The limit is per user: someone else is unaffected.
    expect((await get('/api/v1/transactions/export', other.headers)).statusCode).toBe(200);
  });
});
