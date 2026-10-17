import { ProblemSchema, TransactionSchema } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createCategory,
  createTransaction,
  createTransfer,
  createWallet,
  expectLedgerConsistent,
  getWallet,
  systemCategory,
} from '../support/ledger.js';

describeDb('transactions API: create, edit, delete (real PostgreSQL)', () => {
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

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    headers: Record<string, string>,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers,
      ...(payload !== undefined && { payload: payload as object }),
    });

  async function setup() {
    const user = await registerUser(ctx.app);
    const wallet = await createWallet(ctx.app, user, {
      currency: 'EUR',
      openingBalanceMinor: 10_000,
    });
    const expense = await systemCategory(ctx.app, user, 'expense');
    const income = await systemCategory(ctx.app, user, 'income');
    return { user, wallet, expense, income };
  }

  const code = (res: { json(): unknown }) => ProblemSchema.parse(res.json()).code;

  describe('create', () => {
    it('creates an expense in the wallet currency and updates the balance', async () => {
      const { user, wallet, expense } = await setup();
      const res = await call('POST', '/api/v1/transactions', user.headers, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 2500,
        occurredOn: '2026-10-05',
        note: '  lunch  ',
      });
      expect(res.statusCode).toBe(201);
      const tx = TransactionSchema.parse(res.json());
      expect(tx).toMatchObject({
        type: 'expense',
        amountMinor: 2500,
        currency: 'EUR',
        occurredOn: '2026-10-05',
        note: 'lunch',
        transfer: null,
        recurringTemplateId: null,
        wallet: { id: wallet.id, currency: 'EUR', archived: false },
        category: { id: expense.id, type: 'expense', system: true },
      });
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(7500);
      await expectLedgerConsistent(ctx.owner);
    });

    it('creates income, accepts an own category, and stores a blank note as null', async () => {
      const { user, wallet } = await setup();
      const own = await createCategory(ctx.app, user, { type: 'income', name: 'Side gig' });
      const res = await call('POST', '/api/v1/transactions', user.headers, {
        type: 'income',
        walletId: wallet.id,
        categoryId: own.id,
        amountMinor: 4000,
        occurredOn: '2026-10-05',
        note: '   ',
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().note).toBeNull();
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(14_000);
    });

    it('rejects a category of the wrong type', async () => {
      const { user, wallet, income } = await setup();
      const res = await call('POST', '/api/v1/transactions', user.headers, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: income.id,
        amountMinor: 100,
        occurredOn: '2026-10-05',
      });
      expect(res.statusCode).toBe(422);
      expect(code(res)).toBe('CATEGORY_TYPE_MISMATCH');
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(10_000);
    });

    it('rejects a retired category', async () => {
      const { user, wallet, expense } = await setup();
      await ctx.owner.query('update categories set retired_at = now() where id = $1', [expense.id]);
      const res = await call('POST', '/api/v1/transactions', user.headers, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 100,
        occurredOn: '2026-10-05',
      });
      expect(res.statusCode).toBe(422);
      expect(code(res)).toBe('CATEGORY_RETIRED');
    });

    it('treats unknown and foreign wallets and categories alike: 422 INVALID_REFERENCE', async () => {
      const { user, wallet, expense } = await setup();
      const mallory = await registerUser(ctx.app);
      const foreignWallet = await createWallet(ctx.app, mallory);
      const foreignCategory = await createCategory(ctx.app, mallory);
      const unknown = '0197f8a0-0000-7000-8000-00000000dead';
      const bodies = [
        { walletId: foreignWallet.id, categoryId: expense.id },
        { walletId: unknown, categoryId: expense.id },
        { walletId: wallet.id, categoryId: foreignCategory.id },
        { walletId: wallet.id, categoryId: unknown },
      ];
      for (const body of bodies) {
        const res = await call('POST', '/api/v1/transactions', user.headers, {
          type: 'expense',
          amountMinor: 100,
          occurredOn: '2026-10-05',
          ...body,
        });
        expect(res.statusCode).toBe(422);
        expect(code(res)).toBe('INVALID_REFERENCE');
      }
      const leaked = await ctx.owner.query(
        'select count(*)::int as n from transactions where wallet_id = $1',
        [foreignWallet.id],
      );
      expect(leaked.rows[0].n).toBe(0);
    });

    it.each([
      ['zero amount', { amountMinor: 0 }],
      ['negative amount', { amountMinor: -5 }],
      ['fractional amount', { amountMinor: 10.5 }],
      ['amount above 10^14', { amountMinor: 100_000_000_000_001 }],
      ['string amount', { amountMinor: '10' }],
      ['impossible date', { occurredOn: '2026-02-30' }],
      ['date before 1900', { occurredOn: '1899-12-31' }],
      ['timestamp instead of date', { occurredOn: '2026-10-05T00:00:00Z' }],
      ['transfer type', { type: 'transfer' }],
      ['long note', { note: 'n'.repeat(501) }],
      ['NUL in note', { note: 'a\u0000b' }],
      ['user injection', { userId: '0197f8a0-0000-7000-8000-000000000001' }],
      ['currency injection', { currency: 'JPY' }],
      ['transfer injection', { transferId: '0197f8a0-0000-7000-8000-000000000001' }],
    ])('rejects %s with 400', async (_name, patch) => {
      const { user, wallet, expense } = await setup();
      const res = await call('POST', '/api/v1/transactions', user.headers, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 100,
        occurredOn: '2026-10-05',
        ...patch,
      });
      expect(res.statusCode).toBe(400);
      expect(code(res)).toBe('VALIDATION_FAILED');
    });
  });

  describe('read and ownership', () => {
    it('returns own transactions and hides other users with 404 on every verb', async () => {
      const { user, wallet, expense } = await setup();
      const mallory = await registerUser(ctx.app);
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
      });
      expect((await call('GET', `/api/v1/transactions/${tx.id}`, user.headers)).statusCode).toBe(
        200,
      );
      const url = `/api/v1/transactions/${tx.id}`;
      const attempts = [
        call('GET', url, mallory.headers),
        call('PATCH', url, mallory.headers, { amountMinor: 1 }),
        call('DELETE', url, mallory.headers),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.statusCode).toBe(404);
        expect(code(res)).toBe('NOT_FOUND');
      }
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(9000);
    });

    it('does not let a user move their transaction into another user wallet', async () => {
      const { user, wallet, expense } = await setup();
      const mallory = await registerUser(ctx.app);
      const foreign = await createWallet(ctx.app, mallory);
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
      });
      const res = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        walletId: foreign.id,
      });
      expect(res.statusCode).toBe(422);
      expect(code(res)).toBe('INVALID_REFERENCE');
      expect((await getWallet(ctx.app, mallory, foreign.id)).balanceMinor).toBe(0);
    });
  });

  describe('edit', () => {
    it('updates the balance when the amount changes', async () => {
      const { user, wallet, expense } = await setup();
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 1000,
      });
      const res = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        amountMinor: 1800,
        occurredOn: '2026-09-30',
        note: 'edited',
      });
      expect(res.json()).toMatchObject({
        amountMinor: 1800,
        occurredOn: '2026-09-30',
        note: 'edited',
      });
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(10_000 - 1800);
      const cleared = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        note: null,
      });
      expect(cleared.json().note).toBeNull();
      await expectLedgerConsistent(ctx.owner);
    });

    it('moves the effect between wallets and adopts the new wallet currency', async () => {
      const { user, wallet, expense } = await setup();
      const usd = await createWallet(ctx.app, user, { currency: 'USD', openingBalanceMinor: 500 });
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 1000,
      });
      const res = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        walletId: usd.id,
      });
      expect(res.json()).toMatchObject({ currency: 'USD', wallet: { id: usd.id } });
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(10_000);
      expect((await getWallet(ctx.app, user, usd.id)).balanceMinor).toBe(500 - 1000);
      await expectLedgerConsistent(ctx.owner);
    });

    it('flips the sign when the type changes, and needs a category of the new type', async () => {
      const { user, wallet, expense, income } = await setup();
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 1000,
      });
      const missing = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        type: 'income',
      });
      expect(missing.statusCode).toBe(422);
      expect(code(missing)).toBe('CATEGORY_TYPE_MISMATCH');
      const wrong = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        type: 'income',
        categoryId: expense.id,
      });
      expect(code(wrong)).toBe('CATEGORY_TYPE_MISMATCH');
      const ok = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        type: 'income',
        categoryId: income.id,
      });
      expect(ok.statusCode).toBe(200);
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(10_000 + 1000);
      await expectLedgerConsistent(ctx.owner);
    });

    it('keeps a retired category on edits but refuses switching to one', async () => {
      const { user, wallet, expense } = await setup();
      const other = await systemCategory(ctx.app, user, 'expense', 'Taxes');
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
      });
      await ctx.owner.query('update categories set retired_at = now() where id in ($1, $2)', [
        expense.id,
        other.id,
      ]);
      const same = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        categoryId: expense.id,
        amountMinor: 5,
      });
      expect(same.statusCode).toBe(200);
      const toRetired = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, {
        categoryId: other.id,
      });
      expect(toRetired.statusCode).toBe(422);
      expect(code(toRetired)).toBe('CATEGORY_RETIRED');
    });

    it('rejects unknown fields on edit', async () => {
      const { user, wallet, expense } = await setup();
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
      });
      for (const body of [{ userId: user.id }, { transferId: user.id }, { signedAmountMinor: 5 }]) {
        const res = await call('PATCH', `/api/v1/transactions/${tx.id}`, user.headers, body);
        expect(res.statusCode).toBe(400);
      }
    });
  });

  describe('delete', () => {
    it('removes the transaction and restores the balance', async () => {
      const { user, wallet, expense } = await setup();
      const tx = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 3000,
      });
      const del = await call('DELETE', `/api/v1/transactions/${tx.id}`, user.headers);
      expect(del.statusCode).toBe(204);
      expect((await call('GET', `/api/v1/transactions/${tx.id}`, user.headers)).statusCode).toBe(
        404,
      );
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(10_000);
      await expectLedgerConsistent(ctx.owner);
    });

    it('refuses to edit or delete a transfer leg', async () => {
      const { user, wallet } = await setup();
      const other = await createWallet(ctx.app, user, { currency: 'EUR' });
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: wallet.id,
        toWalletId: other.id,
        amountMinor: 700,
      });
      for (const id of [transfer.outTransactionId, transfer.inTransactionId]) {
        const patch = await call('PATCH', `/api/v1/transactions/${id}`, user.headers, {
          amountMinor: 1,
        });
        const del = await call('DELETE', `/api/v1/transactions/${id}`, user.headers);
        for (const res of [patch, del]) {
          expect(res.statusCode).toBe(409);
          expect(code(res)).toBe('TRANSFER_LEG_IMMUTABLE');
        }
      }
      expect((await getWallet(ctx.app, user, wallet.id)).balanceMinor).toBe(10_000 - 700);
    });
  });
});
