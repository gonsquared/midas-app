import { CATEGORY_LIMIT, ProblemSchema, WALLET_LIMIT } from '@midas/shared';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIntegrationContext,
  registerUser,
  type IntegrationContext,
  type TestUser,
} from '../support/api.js';
import { dbTestInfo, describeDb, truncateAll } from '../support/db.js';
import {
  createCategory,
  createTransaction,
  createTransfer,
  createWallet,
  expectLedgerConsistent,
  getWallet,
  systemCategory,
  waitForLockWaiters,
} from '../support/ledger.js';

// Races between ledger writers and wallet or category maintenance (database design 9.2, 16.5).
// Deterministic cases hold a row lock on a separate owner connection, queue API requests behind
// it, and release it; parallel cases fire many requests at once and check the invariants.

describeDb('ledger concurrency (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  /** Owner connection that holds locks for the deterministic cases. */
  let holder: pg.Client;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
    holder = new pg.Client({ connectionString: dbTestInfo()!.ownerUrl });
    await holder.connect();
  });
  afterEach(async () => {
    await holder.end();
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

  const code = (res: LightMyRequestResponse) => ProblemSchema.parse(res.json()).code;
  const statuses = (results: LightMyRequestResponse[]) => results.map((r) => r.statusCode);

  /** Holds FOR NO KEY UPDATE on the wallet row until `release` (the archive or edit stand-in). */
  async function holdWallet(walletId: string): Promise<{ release: () => Promise<void> }> {
    await holder.query('BEGIN');
    await holder.query('SELECT 1 FROM wallets WHERE id = $1 FOR NO KEY UPDATE', [walletId]);
    return {
      release: async () => {
        await holder.query('COMMIT');
      },
    };
  }

  describe('archive vs create', () => {
    it('a create queued behind an archive sees the archived wallet (no time-of-check gap)', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { openingBalanceMinor: 5_000 });
      const expense = await systemCategory(ctx.app, user, 'expense');

      await holder.query('BEGIN');
      await holder.query('UPDATE wallets SET archived_at = now() WHERE id = $1', [wallet.id]);
      const create = call('POST', '/api/v1/transactions', user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 700,
        occurredOn: '2026-10-05',
      });
      await waitForLockWaiters(ctx.owner, 1);
      await holder.query('COMMIT');

      const res = await create;
      expect(res.statusCode).toBe(409);
      expect(code(res)).toBe('WALLET_ARCHIVED');
      const rows = await ctx.owner.query('select count(*)::int as n from transactions');
      expect(rows.rows[0].n).toBe(0);
    });

    it('parallel creates and an archive: every create either commits before it or is refused', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { openingBalanceMinor: 5_000 });
      const expense = await systemCategory(ctx.app, user, 'expense');
      const creates = Array.from({ length: 10 }, () =>
        call('POST', '/api/v1/transactions', user, {
          type: 'expense',
          walletId: wallet.id,
          categoryId: expense.id,
          amountMinor: 100,
          occurredOn: '2026-10-05',
        }),
      );
      const archive = call('POST', `/api/v1/wallets/${wallet.id}/archive`, user);
      const results = await Promise.all(creates);
      expect((await archive).statusCode).toBe(200);

      for (const res of results) {
        expect([201, 409]).toContain(res.statusCode);
        if (res.statusCode === 409) expect(code(res)).toBe('WALLET_ARCHIVED');
      }
      const created = results.filter((r) => r.statusCode === 201).length;
      // Every 201 is stored and every refusal left nothing behind (commit order against the
      // archive is proven by the deterministic case above).
      const rows = await ctx.owner.query('select count(*)::int as n from transactions');
      expect(rows.rows[0].n).toBe(created);
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(5_000 - 100 * created);
      // Once archived, a new create is refused.
      const late = await call('POST', '/api/v1/transactions', user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 100,
        occurredOn: '2026-10-05',
      });
      expect(code(late)).toBe('WALLET_ARCHIVED');
    });
  });

  describe('category delete with reassignment vs create and edit (lock order, M1)', () => {
    it('does not wait on a stalled edit: the edit holds no ledger row lock before its wallet', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { openingBalanceMinor: 10_000 });
      const doomed = await createCategory(ctx.app, user, { name: 'Doomed' });
      const target = await createCategory(ctx.app, user, { name: 'Target' });
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: doomed.id,
        amountMinor: 1_000,
      });

      // Stall every ledger writer on the wallet, then queue an edit and a create behind it.
      const lock = await holdWallet(wallet.id);
      const edit = call('PATCH', `/api/v1/transactions/${tx.id}`, user, { amountMinor: 2_000 });
      await waitForLockWaiters(ctx.owner, 1);
      const create = call('POST', '/api/v1/transactions', user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: doomed.id,
        amountMinor: 300,
        occurredOn: '2026-10-05',
      });
      await waitForLockWaiters(ctx.owner, 2);

      // The queued edit must not hold the ledger row (it would if it locked the row first).
      const probe = new pg.Client({ connectionString: dbTestInfo()!.ownerUrl });
      await probe.connect();
      try {
        await probe.query('BEGIN');
        await probe.query('SELECT 1 FROM transactions WHERE id = $1 FOR UPDATE NOWAIT', [tx.id]);
        await probe.query('ROLLBACK');
      } finally {
        await probe.end();
      }

      // So delete-and-reassign completes while the edit and the create are still queued: no
      // cycle of wallet, category and ledger row locks can form.
      const del = await call(
        'DELETE',
        `/api/v1/categories/${doomed.id}?reassignTo=${target.id}`,
        user,
      );
      expect(del.statusCode).toBe(200);
      expect(del.json()).toMatchObject({ reassignedTransactions: 1 });

      await lock.release();
      const [edited, created] = await Promise.all([edit, create]);
      expect(edited.statusCode).toBe(200);
      expect(edited.json()).toMatchObject({ amountMinor: 2_000, category: { id: target.id } });
      // The create read its category after the delete committed: a reference error, not a 500.
      expect(created.statusCode).toBe(422);
      expect(code(created)).toBe('INVALID_REFERENCE');
      expect(created.json().errors).toEqual([expect.objectContaining({ field: 'categoryId' })]);
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(8_000);
    });

    it('a create that wins the category lock is reassigned with the rest', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user);
      const doomed = await createCategory(ctx.app, user, { name: 'Doomed' });
      const target = await createCategory(ctx.app, user, { name: 'Target' });
      await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: doomed.id,
      });

      // The holder plays a create that has locked the category (key share) and not committed.
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM categories WHERE id = $1 FOR KEY SHARE', [doomed.id]);
      const del = call('DELETE', `/api/v1/categories/${doomed.id}?reassignTo=${target.id}`, user);
      await waitForLockWaiters(ctx.owner, 1);
      await holder.query(
        `INSERT INTO transactions (user_id, wallet_id, type, category_id, amount_minor, currency, occurred_on)
         VALUES ($1, $2, 'expense', $3, 50, $4, DATE '2026-10-06')`,
        [user.id, wallet.id, doomed.id, wallet.currency],
      );
      await holder.query('COMMIT');

      const res = await del;
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ reassignedTransactions: 2 });
      const moved = await ctx.owner.query(
        'select count(*)::int as n from transactions where category_id = $1',
        [target.id],
      );
      expect(moved.rows[0].n).toBe(2);
    });

    it('parallel rounds of delete+reassign, edits and creates never fail with a 500', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { openingBalanceMinor: 50_000 });
      const target = await createCategory(ctx.app, user, { name: 'Target' });
      for (let round = 0; round < 5; round++) {
        const doomed = await createCategory(ctx.app, user, { name: `Doomed ${round}` });
        const txs = await Promise.all(
          [1, 2, 3].map(() =>
            createTransaction(ctx.app, user, {
              type: 'expense',
              walletId: wallet.id,
              categoryId: doomed.id,
              amountMinor: 100,
            }),
          ),
        );
        const edits = txs.map((tx, i) =>
          call('PATCH', `/api/v1/transactions/${tx.id}`, user, { amountMinor: 200 + i }),
        );
        const del = call('DELETE', `/api/v1/categories/${doomed.id}?reassignTo=${target.id}`, user);
        const creates = [1, 2].map(() =>
          call('POST', '/api/v1/transactions', user, {
            type: 'expense',
            walletId: wallet.id,
            categoryId: doomed.id,
            amountMinor: 10,
            occurredOn: '2026-10-05',
          }),
        );
        expect(statuses(await Promise.all(edits))).toEqual([200, 200, 200]);
        expect((await del).statusCode).toBe(200);
        for (const c of await Promise.all(creates)) {
          expect([201, 422]).toContain(c.statusCode);
          if (c.statusCode === 422) expect(code(c)).toBe('INVALID_REFERENCE');
        }
        const stale = await ctx.owner.query(
          'select count(*)::int as n from transactions where category_id = $1',
          [doomed.id],
        );
        expect(stale.rows[0].n).toBe(0);
      }
    });
  });

  describe('edits that move a row between wallets', () => {
    it('an edit queued behind a move restarts on the new wallet instead of losing the move', async () => {
      const user = await registerUser(ctx.app);
      const a = await createWallet(ctx.app, user, { openingBalanceMinor: 1_000 });
      const b = await createWallet(ctx.app, user, { openingBalanceMinor: 1_000 });
      const expense = await systemCategory(ctx.app, user, 'expense');
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: a.id,
        categoryId: expense.id,
        amountMinor: 100,
      });

      const lock = await holdWallet(a.id);
      const move = call('PATCH', `/api/v1/transactions/${tx.id}`, user, { walletId: b.id });
      await waitForLockWaiters(ctx.owner, 1);
      const amend = call('PATCH', `/api/v1/transactions/${tx.id}`, user, { amountMinor: 400 });
      await waitForLockWaiters(ctx.owner, 2);
      await lock.release();

      expect(statuses(await Promise.all([move, amend]))).toEqual([200, 200]);
      const final = await call('GET', `/api/v1/transactions/${tx.id}`, user);
      expect(final.json()).toMatchObject({ amountMinor: 400, wallet: { id: b.id } });
      expect((await getWallet(ctx.app, user, a.id)).balanceMinor).toBe(1_000);
      expect((await getWallet(ctx.app, user, b.id)).balanceMinor).toBe(600);
    });

    it('concurrent edits of one transfer that move different legs stay a valid pair', async () => {
      const user = await registerUser(ctx.app);
      const wallets = await Promise.all(
        [1, 2, 3, 4].map(() => createWallet(ctx.app, user, { currency: 'EUR' })),
      );
      const [a, b, c, d] = wallets.map((w) => w.id) as [string, string, string, string];
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: a,
        toWalletId: b,
        amountMinor: 500,
      });
      const results = await Promise.all([
        call('PATCH', `/api/v1/transfers/${transfer.id}`, user, { toWalletId: c }),
        call('PATCH', `/api/v1/transfers/${transfer.id}`, user, { fromWalletId: d }),
        call('PATCH', `/api/v1/transfers/${transfer.id}`, user, { amountMinor: 650 }),
      ]);
      expect(statuses(results)).toEqual([200, 200, 200]);
      const final = (await call('GET', `/api/v1/transfers/${transfer.id}`, user)).json();
      expect(final).toMatchObject({
        fromWallet: { id: d },
        toWallet: { id: c },
        amountMinor: 650,
        toAmountMinor: 650,
      });
    });
  });

  describe('wallet currency change vs create', () => {
    it.each([
      ['the currency change', 'EUR'],
      ['the create', 'USD'],
    ])('serializes on the wallet row when %s queues first', async (first, expected) => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { currency: 'USD' });
      const expense = await systemCategory(ctx.app, user, 'expense');
      const change = () => call('PATCH', `/api/v1/wallets/${wallet.id}`, user, { currency: 'EUR' });
      const create = () =>
        call('POST', '/api/v1/transactions', user, {
          type: 'expense',
          walletId: wallet.id,
          categoryId: expense.id,
          amountMinor: 100,
          occurredOn: '2026-10-05',
        });

      const lock = await holdWallet(wallet.id);
      const changeFirst = first === 'the currency change';
      const p1 = changeFirst ? change() : create();
      await waitForLockWaiters(ctx.owner, 1);
      const p2 = changeFirst ? create() : change();
      await waitForLockWaiters(ctx.owner, 2);
      await lock.release();
      const [r1, r2] = await Promise.all([p1, p2]);
      const [changed, created] = changeFirst ? [r1, r2] : [r2, r1];

      expect(created.statusCode).toBe(201);
      expect(created.json().currency).toBe(expected);
      if (changeFirst) {
        expect(changed.statusCode).toBe(200);
      } else {
        expect(changed.statusCode).toBe(409);
        expect(code(changed)).toBe('WALLET_CURRENCY_LOCKED');
      }
      const mismatched = await ctx.owner.query(
        `select count(*)::int as n from transactions t join wallets w on w.id = t.wallet_id
          where t.currency <> w.currency`,
      );
      expect(mismatched.rows[0].n).toBe(0);
    });
  });

  describe('per-user limits under concurrent creates', () => {
    it(`never exceeds ${WALLET_LIMIT} wallets`, async () => {
      const user = await registerUser(ctx.app);
      await ctx.owner.query(
        `insert into wallets (user_id, name, type, currency)
         select $1, concat('Seeded ', g), 'bank', 'USD' from generate_series(1, $2::int) g`,
        [user.id, WALLET_LIMIT - 1],
      );
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          call('POST', '/api/v1/wallets', user, { name: `Race ${i}`, type: 'cash' }),
        ),
      );
      expect(statuses(results).sort()).toEqual([201, 409, 409, 409, 409, 409]);
      for (const res of results.filter((r) => r.statusCode === 409)) {
        expect(code(res)).toBe('LIMIT_REACHED');
      }
      const count = await ctx.owner.query(
        'select count(*)::int as n from wallets where user_id = $1',
        [user.id],
      );
      expect(count.rows[0].n).toBe(WALLET_LIMIT);
    });

    it(`never exceeds ${CATEGORY_LIMIT} own categories`, async () => {
      const user = await registerUser(ctx.app);
      await ctx.owner.query(
        `insert into categories (owner_user_id, name, type, icon, color)
         select $1, concat('Seeded ', g), 'expense', 'tag', 'blue' from generate_series(1, $2::int) g`,
        [user.id, CATEGORY_LIMIT - 1],
      );
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          call('POST', '/api/v1/categories', user, {
            name: `Race ${i}`,
            type: 'income',
            icon: 'tag',
            color: 'green',
          }),
        ),
      );
      expect(statuses(results).sort()).toEqual([201, 409, 409, 409, 409, 409]);
      for (const res of results.filter((r) => r.statusCode === 409)) {
        expect(code(res)).toBe('LIMIT_REACHED');
      }
      const count = await ctx.owner.query(
        'select count(*)::int as n from categories where owner_user_id = $1',
        [user.id],
      );
      expect(count.rows[0].n).toBe(CATEGORY_LIMIT);
    });
  });

  describe('many parallel writes to one wallet', () => {
    it('keeps every stored balance equal to opening balance plus the ledger', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { openingBalanceMinor: 100_000 });
      const other = await createWallet(ctx.app, user, { openingBalanceMinor: 0 });
      const expense = await systemCategory(ctx.app, user, 'expense');
      const income = await systemCategory(ctx.app, user, 'income');
      const seeded: Array<{ id: string }> = [];
      for (let i = 0; i < 10; i++) {
        seeded.push(
          await createTransaction(ctx.app, user, {
            type: 'expense',
            walletId: wallet.id,
            categoryId: expense.id,
            amountMinor: 100 + i,
          }),
        );
      }

      const creates = Array.from({ length: 30 }, (_, i) => ({
        type: i % 3 === 0 ? 'income' : 'expense',
        categoryId: i % 3 === 0 ? income.id : expense.id,
        amountMinor: 50 + i,
      }));
      const writes = [
        ...creates.map((body) =>
          call('POST', '/api/v1/transactions', user, {
            ...body,
            walletId: wallet.id,
            occurredOn: '2026-10-05',
          }),
        ),
        ...seeded
          .slice(0, 4)
          .map((tx, i) =>
            call('PATCH', `/api/v1/transactions/${tx.id}`, user, { amountMinor: 1_000 + i }),
          ),
        ...seeded.slice(4, 7).map((tx) => call('DELETE', `/api/v1/transactions/${tx.id}`, user)),
        ...seeded
          .slice(7, 10)
          .map((tx) =>
            call('PATCH', `/api/v1/transactions/${tx.id}`, user, { walletId: other.id }),
          ),
        ...Array.from({ length: 6 }, (_, i) =>
          call('POST', '/api/v1/transfers', user, {
            fromWalletId: i % 2 === 0 ? wallet.id : other.id,
            toWalletId: i % 2 === 0 ? other.id : wallet.id,
            amountMinor: 25,
            occurredOn: '2026-10-05',
          }),
        ),
      ];
      const results = await Promise.all(writes);
      for (const res of results) expect([200, 201, 204]).toContain(res.statusCode);

      // Expected from the requests alone: the created rows, the four edited seeded rows, and
      // transfers that cancel out (three in each direction). Deleted and moved rows are gone.
      const createdSum = creates.reduce(
        (sum, c) => sum + (c.type === 'income' ? c.amountMinor : -c.amountMinor),
        0,
      );
      const editedSum = -(1_000 + 1_001 + 1_002 + 1_003);
      const movedSum = -(107 + 108 + 109);
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(
        100_000 + createdSum + editedSum,
      );
      expect((await getWallet(ctx.app, user, other.id)).balanceMinor).toBe(movedSum);
    });
  });
});
