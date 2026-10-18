import { ProblemSchema, TransactionPageSchema, type Transaction } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createTransaction,
  createTransfer,
  createWallet,
  expectLedgerConsistent,
  systemCategory,
} from '../support/ledger.js';

type Page = { items: Transaction[]; nextCursor: string | null };

describeDb('transaction list, search and filter API (real PostgreSQL)', () => {
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
  // C-01 and C-02 invariants after every test (database design 16.5).
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });

  const list = (headers: Record<string, string>, query = '') =>
    ctx.app.inject({ method: 'GET', url: `/api/v1/transactions${query}`, headers });
  const page = async (headers: Record<string, string>, query = ''): Promise<Page> => {
    const res = await list(headers, query);
    if (res.statusCode !== 200) throw new Error(`list failed: ${res.body}`);
    return TransactionPageSchema.parse(res.json());
  };

  async function dataset() {
    const user = await registerUser(ctx.app);
    const w1 = await createWallet(ctx.app, user, { name: 'W1', currency: 'EUR' });
    const w2 = await createWallet(ctx.app, user, { name: 'W2', currency: 'EUR' });
    const food = await systemCategory(ctx.app, user, 'expense', 'Groceries');
    const fun = await systemCategory(ctx.app, user, 'expense', 'Entertainment');
    const pay = await systemCategory(ctx.app, user, 'income', 'Salary');
    const rows = [
      {
        type: 'expense',
        walletId: w1.id,
        categoryId: food.id,
        amountMinor: 1200,
        occurredOn: '2026-01-10',
        note: 'Weekly SHOP at Lidl',
      },
      {
        type: 'expense',
        walletId: w1.id,
        categoryId: food.id,
        amountMinor: 800,
        occurredOn: '2026-02-10',
        note: '100% organic_veg',
      },
      {
        type: 'expense',
        walletId: w2.id,
        categoryId: fun.id,
        amountMinor: 5000,
        occurredOn: '2026-02-20',
        note: 'Cinema',
      },
      {
        type: 'income',
        walletId: w2.id,
        categoryId: pay.id,
        amountMinor: 250_000,
        occurredOn: '2026-03-01',
        note: null,
      },
      {
        type: 'expense',
        walletId: w2.id,
        categoryId: food.id,
        amountMinor: 1200,
        occurredOn: '2026-03-15',
        note: 'shop again',
      },
    ];
    const txs: Transaction[] = [];
    for (const row of rows) txs.push(await createTransaction(ctx.app, user, row));
    return { user, w1, w2, food, fun, pay, txs };
  }

  describe('filters', () => {
    it('filters by inclusive date range', async () => {
      const { user } = await dataset();
      const res = await page(user.headers, '?from=2026-02-10&to=2026-03-01');
      expect(res.items.map((t) => t.occurredOn)).toEqual([
        '2026-03-01',
        '2026-02-20',
        '2026-02-10',
      ]);
    });

    it('filters by one or several wallets and categories', async () => {
      const { user, w1, w2, food, fun } = await dataset();
      expect((await page(user.headers, `?walletId=${w1.id}`)).items).toHaveLength(2);
      expect((await page(user.headers, `?walletId=${w1.id}&walletId=${w2.id}`)).items).toHaveLength(
        5,
      );
      expect((await page(user.headers, `?categoryId=${food.id}`)).items).toHaveLength(3);
      expect(
        (await page(user.headers, `?categoryId=${food.id}&categoryId=${fun.id}`)).items,
      ).toHaveLength(4);
    });

    it('filters by one or several types', async () => {
      const { user } = await dataset();
      expect((await page(user.headers, '?type=income')).items).toHaveLength(1);
      expect((await page(user.headers, '?type=income&type=expense')).items).toHaveLength(5);
      expect((await page(user.headers, '?type=transfer')).items).toHaveLength(0);
    });

    it('searches notes case-insensitively and treats LIKE wildcards literally', async () => {
      const { user } = await dataset();
      const shop = await page(user.headers, '?q=shop');
      expect(shop.items.map((t) => t.note)).toEqual(['shop again', 'Weekly SHOP at Lidl']);
      expect((await page(user.headers, '?q=%25')).items.map((t) => t.note)).toEqual([
        '100% organic_veg',
      ]);
      expect((await page(user.headers, '?q=orga_ic')).items).toHaveLength(0);
      expect((await page(user.headers, '?q=_')).items).toHaveLength(1);
      expect((await page(user.headers, '?q=%25%25')).items).toHaveLength(0);
    });

    it('filters by an inclusive amount range', async () => {
      const { user } = await dataset();
      const res = await page(
        user.headers,
        '?minAmountMinor=800&maxAmountMinor=1200&sort=amount_asc',
      );
      expect(res.items.map((t) => t.amountMinor)).toEqual([800, 1200, 1200]);
    });

    it('combines filters with AND', async () => {
      const { user, w2, food } = await dataset();
      const res = await page(user.headers, `?walletId=${w2.id}&categoryId=${food.id}&q=shop`);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.occurredOn).toBe('2026-03-15');
    });

    it('never returns other users rows, even when their ids are passed as filters', async () => {
      const { user } = await dataset();
      const mallory = await registerUser(ctx.app);
      const w = await createWallet(ctx.app, mallory, { currency: 'EUR' });
      const cat = await systemCategory(ctx.app, mallory, 'expense');
      await createTransaction(ctx.app, mallory, {
        type: 'expense',
        walletId: w.id,
        categoryId: cat.id,
        note: 'secret',
      });
      expect((await page(user.headers, `?walletId=${w.id}`)).items).toEqual([]);
      expect((await page(user.headers, '?q=secret')).items).toEqual([]);
      expect((await page(user.headers)).items).toHaveLength(5);
    });

    it('lists transfer legs as rows of their wallet and supports the type filter', async () => {
      const { user, w1, w2 } = await dataset();
      await createTransfer(ctx.app, user, {
        fromWalletId: w1.id,
        toWalletId: w2.id,
        amountMinor: 77,
      });
      const legs = await page(user.headers, `?type=transfer&walletId=${w1.id}`);
      expect(legs.items).toHaveLength(1);
      expect(legs.items[0]?.transfer?.direction).toBe('out');
    });
  });

  describe('sorting and pagination', () => {
    /** 30 rows with many ties on date and amount, inserted directly for speed. */
    async function bulk() {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { currency: 'EUR' });
      const category = await systemCategory(ctx.app, user, 'expense');
      await ctx.owner.query(
        `insert into transactions (user_id, wallet_id, type, category_id, amount_minor, currency, occurred_on, note)
         select $1, $2, 'expense', $3, 100 + (g % 4) * 50, 'EUR', date '2026-01-01' + (g % 5), 'n' || g
           from generate_series(1, 30) g`,
        [user.id, wallet.id, category.id],
      );
      return { user, wallet, category };
    }

    async function walk(
      headers: Record<string, string>,
      sort: string,
      limit: number,
    ): Promise<Transaction[]> {
      const all: Transaction[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 50; guard++) {
        const query: string = `?sort=${sort}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
        const res: Page = await page(headers, query);
        expect(res.items.length).toBeLessThanOrEqual(limit);
        all.push(...res.items);
        cursor = res.nextCursor;
        if (!cursor) return all;
      }
      throw new Error('pagination did not terminate');
    }

    it.each(['date_desc', 'date_asc', 'amount_desc', 'amount_asc'])(
      'pages through %s without gaps or duplicates, in the order of one big page',
      async (sort) => {
        const { user } = await bulk();
        const paged = await walk(user.headers, sort, 7);
        const whole = (await page(user.headers, `?sort=${sort}&limit=100`)).items;
        expect(paged).toHaveLength(30);
        expect(new Set(paged.map((t) => t.id)).size).toBe(30);
        expect(paged.map((t) => t.id)).toEqual(whole.map((t) => t.id));
      },
    );

    it('orders by date or amount, newest or largest first by default', async () => {
      const { user } = await bulk();
      const byDate = (await page(user.headers, '?limit=100')).items.map((t) => t.occurredOn);
      expect(byDate).toEqual([...byDate].sort().reverse());
      const asc = (await page(user.headers, '?sort=amount_asc&limit=100')).items;
      const amountsAsc = asc.map((t) => t.amountMinor);
      expect(amountsAsc).toEqual([...amountsAsc].sort((a, b) => a - b));
      const desc = (await page(user.headers, '?sort=amount_desc&limit=100')).items;
      const amountsDesc = desc.map((t) => t.amountMinor);
      expect(amountsDesc).toEqual([...amountsDesc].sort((a, b) => b - a));
    });

    it('breaks ties by created_at then id (stable)', async () => {
      const { user } = await bulk();
      const rows = (await page(user.headers, '?sort=date_asc&limit=100')).items;
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1] as Transaction;
        const b = rows[i] as Transaction;
        if (a.occurredOn === b.occurredOn) {
          expect(`${a.createdAt}|${a.id}` <= `${b.createdAt}|${b.id}`).toBe(true);
        }
      }
    });

    it('defaults to 25 items, caps at 100 and rejects out-of-range limits', async () => {
      const { user } = await bulk();
      const first = await page(user.headers);
      expect(first.items).toHaveLength(25);
      expect(first.nextCursor).not.toBeNull();
      for (const limit of ['0', '101', '-1', 'abc', '1.5']) {
        const res = await list(user.headers, `?limit=${limit}`);
        expect(res.statusCode).toBe(400);
        expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
      }
    });

    it('keeps pages stable when rows are added between requests', async () => {
      const { user, wallet, category } = await bulk();
      const first = await page(user.headers, '?limit=10');
      await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: category.id,
        occurredOn: '2099-01-01',
      });
      const second = await page(user.headers, `?limit=10&cursor=${first.nextCursor}`);
      const ids = new Set(first.items.map((t) => t.id));
      expect(second.items.every((t) => !ids.has(t.id))).toBe(true);
      expect(second.items).toHaveLength(10);
    });

    it('rejects cursors that are garbage, tampered or bound to another query', async () => {
      const { user } = await bulk();
      const first = await page(user.headers, '?limit=5&sort=date_desc&type=expense');
      const cursor = first.nextCursor as string;
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const badCursors = [
        'not-a-cursor',
        'e30',
        encode({ v: 1, s: 'date_desc', f: 'x', k: ['a', 'b', 'c'] }),
        encode({ v: 1, s: 'date_desc', f: 'x'.repeat(22), k: ['2026-01-01', 'now()', 'id'] }),
      ];
      for (const bad of badCursors) {
        const res = await list(user.headers, `?limit=5&cursor=${encodeURIComponent(bad)}`);
        expect(res.statusCode).toBe(400);
        expect(ProblemSchema.parse(res.json()).code).toBe('INVALID_CURSOR');
      }
      const otherQueries = [
        '?limit=5&sort=date_asc&type=expense',
        '?limit=5&sort=date_desc&type=income',
        '?limit=5&sort=date_desc',
      ];
      for (const other of otherQueries) {
        const res = await list(user.headers, `${other}&cursor=${cursor}`);
        expect(res.statusCode).toBe(400);
        expect(ProblemSchema.parse(res.json()).code).toBe('INVALID_CURSOR');
      }
    });

    it('a cursor from another user only ever yields the caller own rows', async () => {
      const { user } = await bulk();
      const mallory = await registerUser(ctx.app);
      const first = await page(user.headers, '?limit=5');
      const res = await page(mallory.headers, `?limit=5&cursor=${first.nextCursor}`);
      expect(res.items).toEqual([]);
    });

    it('treats SQL text in q as a literal string', async () => {
      const { user } = await bulk();
      const q = encodeURIComponent('x; DROP TABLE transactions;--');
      expect((await page(user.headers, `?q=${q}`)).items).toEqual([]);
      expect((await page(user.headers)).items).toHaveLength(25);
    });

    it.each([
      ['inverted dates', '?from=2026-03-01&to=2026-02-01'],
      ['bad date', '?from=2026-02-30'],
      ['inverted amounts', '?minAmountMinor=10&maxAmountMinor=5'],
      ['non-uuid wallet', '?walletId=1'],
      ['unknown type', '?type=refund'],
      ['unknown sort', '?sort=random'],
      ['unknown parameter', '?userId=1'],
      ['empty q', '?q='],
    ])('rejects %s with 400', async (_name, query) => {
      const { user } = await bulk();
      const res = await list(user.headers, query);
      expect(res.statusCode).toBe(400);
      expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
    });
  });
});
