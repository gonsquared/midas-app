import { ProblemSchema, WalletSchema } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createTransaction,
  createWallet,
  expectLedgerConsistent,
  getWallet,
  systemCategory,
} from '../support/ledger.js';

describeDb('wallets API (real PostgreSQL)', () => {
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

  describe('create and read', () => {
    it('creates a wallet with the preference currency and a zero opening balance', async () => {
      const user = await registerUser(ctx.app, { currency: 'EUR' });
      const res = await call('POST', '/api/v1/wallets', user.headers, {
        name: 'Main',
        type: 'bank',
      });
      expect(res.statusCode).toBe(201);
      const wallet = WalletSchema.parse(res.json());
      expect(wallet).toMatchObject({
        name: 'Main',
        type: 'bank',
        currency: 'EUR',
        openingBalanceMinor: 0,
        balanceMinor: 0,
        archived: false,
        archivedAt: null,
        hasTransactions: false,
      });
    });

    it('rejects a duplicate active name case-insensitively but allows it for other users', async () => {
      const alice = await registerUser(ctx.app);
      const bob = await registerUser(ctx.app);
      await createWallet(ctx.app, alice, { name: 'Savings' });
      const dup = await call('POST', '/api/v1/wallets', alice.headers, {
        name: 'sAvInGs',
        type: 'cash',
      });
      expect(dup.statusCode).toBe(409);
      expect(ProblemSchema.parse(dup.json()).code).toBe('WALLET_NAME_TAKEN');
      const other = await call('POST', '/api/v1/wallets', bob.headers, {
        name: 'Savings',
        type: 'cash',
      });
      expect(other.statusCode).toBe(201);
    });

    it('lists only own wallets sorted by name and hides archived ones by default', async () => {
      const alice = await registerUser(ctx.app);
      const bob = await registerUser(ctx.app);
      await createWallet(ctx.app, alice, { name: 'b-second' });
      await createWallet(ctx.app, alice, { name: 'A-first' });
      const gone = await createWallet(ctx.app, alice, { name: 'c-archived' });
      await createWallet(ctx.app, bob, { name: 'bobs' });
      await call('POST', `/api/v1/wallets/${gone.id}/archive`, alice.headers);

      const list = await call('GET', '/api/v1/wallets', alice.headers);
      expect(list.json().items.map((w: { name: string }) => w.name)).toEqual([
        'A-first',
        'b-second',
      ]);
      const all = await call('GET', '/api/v1/wallets?includeArchived=true', alice.headers);
      expect(all.json().items).toHaveLength(3);
    });

    it('enforces the 100 wallet limit', async () => {
      const user = await registerUser(ctx.app);
      await ctx.owner.query(
        `insert into wallets (user_id, name, type, currency)
         select $1, 'w' || g, 'cash', 'USD' from generate_series(1, 100) g`,
        [user.id],
      );
      const res = await call('POST', '/api/v1/wallets', user.headers, {
        name: 'one more',
        type: 'cash',
      });
      expect(res.statusCode).toBe(409);
      expect(ProblemSchema.parse(res.json()).code).toBe('LIMIT_REACHED');
    });
  });

  describe('ownership (IDOR)', () => {
    it('answers 404 for every operation on another user wallet and changes nothing', async () => {
      const alice = await registerUser(ctx.app);
      const mallory = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, alice, {
        name: 'Private',
        openingBalanceMinor: 5000,
      });
      const base = `/api/v1/wallets/${wallet.id}`;
      const attempts = [
        call('GET', base, mallory.headers),
        call('PATCH', base, mallory.headers, { name: 'Pwned' }),
        call('POST', `${base}/archive`, mallory.headers),
        call('POST', `${base}/unarchive`, mallory.headers),
        call('DELETE', base, mallory.headers),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.statusCode).toBe(404);
        expect(ProblemSchema.parse(res.json()).code).toBe('NOT_FOUND');
      }
      expect(await getWallet(ctx.app, alice, wallet.id)).toMatchObject({
        name: 'Private',
        archived: false,
      });
      const list = await call('GET', '/api/v1/wallets?includeArchived=true', mallory.headers);
      expect(list.json().items).toEqual([]);
    });
  });

  describe('balance', () => {
    it('is the opening balance plus income minus expense', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { openingBalanceMinor: 10_000 });
      const income = await systemCategory(ctx.app, user, 'income');
      const expense = await systemCategory(ctx.app, user, 'expense');
      await createTransaction(ctx.app, user, {
        type: 'income',
        walletId: wallet.id,
        categoryId: income.id,
        amountMinor: 2500,
      });
      await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: expense.id,
        amountMinor: 700,
      });
      const after = await getWallet(ctx.app, user, wallet.id);
      expect(after.balanceMinor).toBe(10_000 + 2500 - 700);
      expect(after.openingBalanceMinor).toBe(10_000);
      expect(after.hasTransactions).toBe(true);
      await expectLedgerConsistent(ctx.owner);
    });

    it('follows an opening balance edit', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { openingBalanceMinor: 100 });
      const res = await call('PATCH', `/api/v1/wallets/${wallet.id}`, user.headers, {
        openingBalanceMinor: -250,
      });
      expect(res.json()).toMatchObject({ openingBalanceMinor: -250, balanceMinor: -250 });
    });

    it('rejects a balance outside the supported range with 400', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, {
        openingBalanceMinor: 100_000_000_000_000,
      });
      const income = await systemCategory(ctx.app, user, 'income');
      const res = await call('POST', '/api/v1/transactions', user.headers, {
        type: 'income',
        walletId: wallet.id,
        categoryId: income.id,
        amountMinor: 1,
        occurredOn: '2026-10-01',
      });
      expect(res.statusCode).toBe(400);
      expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
      await expectLedgerConsistent(ctx.owner);
    });
  });

  describe('update', () => {
    it('changes name and type; blocks a duplicate name', async () => {
      const user = await registerUser(ctx.app);
      await createWallet(ctx.app, user, { name: 'Taken' });
      const wallet = await createWallet(ctx.app, user, { name: 'Mine', type: 'cash' });
      const ok = await call('PATCH', `/api/v1/wallets/${wallet.id}`, user.headers, {
        name: 'Renamed',
        type: 'savings',
      });
      expect(ok.json()).toMatchObject({ name: 'Renamed', type: 'savings' });
      const clash = await call('PATCH', `/api/v1/wallets/${wallet.id}`, user.headers, {
        name: 'TAKEN',
      });
      expect(clash.statusCode).toBe(409);
      expect(ProblemSchema.parse(clash.json()).code).toBe('WALLET_NAME_TAKEN');
    });

    it('allows a currency change only while the wallet has no transactions', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user, { currency: 'USD' });
      const first = await call('PATCH', `/api/v1/wallets/${wallet.id}`, user.headers, {
        currency: 'EUR',
      });
      expect(first.json().currency).toBe('EUR');
      const category = await systemCategory(ctx.app, user, 'expense');
      await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: category.id,
      });
      const locked = await call('PATCH', `/api/v1/wallets/${wallet.id}`, user.headers, {
        currency: 'GBP',
      });
      expect(locked.statusCode).toBe(409);
      expect(ProblemSchema.parse(locked.json()).code).toBe('WALLET_CURRENCY_LOCKED');
      const same = await call('PATCH', `/api/v1/wallets/${wallet.id}`, user.headers, {
        currency: 'EUR',
      });
      expect(same.statusCode).toBe(200);
    });
  });

  describe('archive, unarchive and delete', () => {
    it('archives idempotently (also with an empty JSON body) and hides the wallet', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user);
      const url = `/api/v1/wallets/${wallet.id}/archive`;
      const first = await ctx.app.inject({
        method: 'POST',
        url,
        headers: { ...user.headers, 'content-type': 'application/json' },
        payload: '',
      });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ archived: true });
      expect(first.json().archivedAt).not.toBeNull();
      const second = await call('POST', url, user.headers);
      expect(second.json().archivedAt).toBe(first.json().archivedAt);
      const list = await call('GET', '/api/v1/wallets', user.headers);
      expect(list.json().items).toEqual([]);
    });

    it('rejects edits, new transactions and transfers on an archived wallet', async () => {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user);
      const other = await createWallet(ctx.app, user);
      const category = await systemCategory(ctx.app, user, 'expense');
      const existing = await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: category.id,
      });
      await call('POST', `/api/v1/wallets/${wallet.id}/archive`, user.headers);

      const edit = await call('PATCH', `/api/v1/wallets/${wallet.id}`, user.headers, { name: 'x' });
      const create = await call('POST', '/api/v1/transactions', user.headers, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: category.id,
        amountMinor: 100,
        occurredOn: '2026-10-02',
      });
      const patchTx = await call('PATCH', `/api/v1/transactions/${existing.id}`, user.headers, {
        amountMinor: 5,
      });
      const deleteTx = await call('DELETE', `/api/v1/transactions/${existing.id}`, user.headers);
      const transfer = await call('POST', '/api/v1/transfers', user.headers, {
        fromWalletId: other.id,
        toWalletId: wallet.id,
        amountMinor: 1,
        occurredOn: '2026-10-02',
      });
      for (const res of [edit, create, patchTx, deleteTx, transfer]) {
        expect(res.statusCode).toBe(409);
        expect(ProblemSchema.parse(res.json()).code).toBe('WALLET_ARCHIVED');
      }
      await expectLedgerConsistent(ctx.owner);
    });

    it('unarchives, and reports a name clash with a newer active wallet', async () => {
      const user = await registerUser(ctx.app);
      const old = await createWallet(ctx.app, user, { name: 'Same' });
      await call('POST', `/api/v1/wallets/${old.id}/archive`, user.headers);
      await createWallet(ctx.app, user, { name: 'same' });
      const clash = await call('POST', `/api/v1/wallets/${old.id}/unarchive`, user.headers);
      expect(clash.statusCode).toBe(409);
      expect(ProblemSchema.parse(clash.json()).code).toBe('WALLET_NAME_TAKEN');

      const solo = await createWallet(ctx.app, user, { name: 'Solo' });
      await call('POST', `/api/v1/wallets/${solo.id}/archive`, user.headers);
      const back = await call('POST', `/api/v1/wallets/${solo.id}/unarchive`, user.headers);
      expect(back.json()).toMatchObject({ archived: false, archivedAt: null });
    });

    it('deletes an unused wallet but refuses one with transactions', async () => {
      const user = await registerUser(ctx.app);
      const empty = await createWallet(ctx.app, user);
      const used = await createWallet(ctx.app, user);
      const category = await systemCategory(ctx.app, user, 'expense');
      await createTransaction(ctx.app, user, {
        type: 'expense',
        walletId: used.id,
        categoryId: category.id,
      });
      expect((await call('DELETE', `/api/v1/wallets/${empty.id}`, user.headers)).statusCode).toBe(
        204,
      );
      expect((await call('GET', `/api/v1/wallets/${empty.id}`, user.headers)).statusCode).toBe(404);
      const blocked = await call('DELETE', `/api/v1/wallets/${used.id}`, user.headers);
      expect(blocked.statusCode).toBe(409);
      expect(ProblemSchema.parse(blocked.json()).code).toBe('WALLET_IN_USE');
    });
  });

  describe('validation', () => {
    it.each([
      ['unknown field userId', { name: 'a', type: 'bank', userId: 'x' }],
      ['balance injection', { name: 'a', type: 'bank', balanceMinor: 99 }],
      ['ledger injection', { name: 'a', type: 'bank', ledgerBalanceMinor: 99 }],
      ['blank name', { name: '   ', type: 'bank' }],
      ['long name', { name: 'x'.repeat(61), type: 'bank' }],
      ['control chars in name', { name: 'a\u0000b', type: 'bank' }],
      ['bad type', { name: 'a', type: 'crypto' }],
      ['bad currency', { name: 'a', type: 'bank', currency: 'XXX' }],
      ['float opening balance', { name: 'a', type: 'bank', openingBalanceMinor: 1.5 }],
      ['huge opening balance', { name: 'a', type: 'bank', openingBalanceMinor: 1e15 }],
      ['string opening balance', { name: 'a', type: 'bank', openingBalanceMinor: '5' }],
      ['missing type', { name: 'a' }],
    ])('POST rejects %s', async (_name, payload) => {
      const user = await registerUser(ctx.app);
      const res = await call('POST', '/api/v1/wallets', user.headers, payload);
      expect(res.statusCode).toBe(400);
      expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
    });

    it('rejects malformed ids, query values and unknown query parameters', async () => {
      const user = await registerUser(ctx.app);
      for (const url of [
        '/api/v1/wallets/not-a-uuid',
        '/api/v1/wallets?includeArchived=maybe',
        '/api/v1/wallets?userId=1',
      ]) {
        expect((await call('GET', url, user.headers)).statusCode).toBe(400);
      }
    });

    it('stores SQL text in a name as inert data', async () => {
      const user = await registerUser(ctx.app);
      const name = 'x); DROP TABLE wallets;--';
      const res = await call('POST', '/api/v1/wallets', user.headers, { name, type: 'cash' });
      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe(name);
      expect((await call('GET', '/api/v1/wallets', user.headers)).json().items).toHaveLength(1);
    });
  });
});
