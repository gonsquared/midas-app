import { ProblemSchema, TransferSchema, TransactionSchema } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createTransfer,
  createWallet,
  expectLedgerConsistent,
  getWallet,
} from '../support/ledger.js';

describeDb('transfers API (real PostgreSQL)', () => {
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
  const code = (res: { json(): unknown }) => ProblemSchema.parse(res.json()).code;

  async function setup() {
    const user = await registerUser(ctx.app);
    const a = await createWallet(ctx.app, user, {
      name: 'A',
      currency: 'EUR',
      openingBalanceMinor: 10_000,
    });
    const b = await createWallet(ctx.app, user, {
      name: 'B',
      currency: 'EUR',
      openingBalanceMinor: 0,
    });
    const usd = await createWallet(ctx.app, user, {
      name: 'USD',
      currency: 'USD',
      openingBalanceMinor: 0,
    });
    return { user, a, b, usd };
  }
  const balance = async (user: Awaited<ReturnType<typeof setup>>['user'], id: string) =>
    (await getWallet(ctx.app, user, id)).balanceMinor;

  describe('create', () => {
    it('debits one wallet and credits the other atomically', async () => {
      const { user, a, b } = await setup();
      const res = await call('POST', '/api/v1/transfers', user.headers, {
        fromWalletId: a.id,
        toWalletId: b.id,
        amountMinor: 2500,
        occurredOn: '2026-10-05',
        note: 'rent split',
      });
      expect(res.statusCode).toBe(201);
      const transfer = TransferSchema.parse(res.json());
      expect(transfer).toMatchObject({
        amountMinor: 2500,
        toAmountMinor: 2500,
        occurredOn: '2026-10-05',
        note: 'rent split',
        fromWallet: { id: a.id },
        toWallet: { id: b.id },
      });
      expect(await balance(user, a.id)).toBe(7500);
      expect(await balance(user, b.id)).toBe(2500);
      await expectLedgerConsistent(ctx.owner);
    });

    it('appears as two linked transactions, one per wallet', async () => {
      const { user, a, b } = await setup();
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: a.id,
        toWalletId: b.id,
        amountMinor: 900,
      });
      const list = await call('GET', '/api/v1/transactions?type=transfer', user.headers);
      const items = list.json<{ items: unknown[] }>().items.map((i) => TransactionSchema.parse(i));
      expect(items).toHaveLength(2);
      const out = items.find((t) => t.id === transfer.outTransactionId);
      const inn = items.find((t) => t.id === transfer.inTransactionId);
      expect(out).toMatchObject({
        type: 'transfer',
        category: null,
        wallet: { id: a.id },
        transfer: {
          transferId: transfer.id,
          direction: 'out',
          counterpartTransactionId: transfer.inTransactionId,
          counterpartWallet: { id: b.id },
          counterpartAmountMinor: 900,
        },
      });
      expect(inn?.transfer).toMatchObject({ direction: 'in', counterpartTransactionId: out?.id });
    });

    it('requires an explicit destination amount across currencies (ADR-008)', async () => {
      const { user, a, usd } = await setup();
      const missing = await call('POST', '/api/v1/transfers', user.headers, {
        fromWalletId: a.id,
        toWalletId: usd.id,
        amountMinor: 1000,
        occurredOn: '2026-10-05',
      });
      expect(missing.statusCode).toBe(422);
      expect(code(missing)).toBe('TO_AMOUNT_REQUIRED');
      const ok = await call('POST', '/api/v1/transfers', user.headers, {
        fromWalletId: a.id,
        toWalletId: usd.id,
        amountMinor: 1000,
        toAmountMinor: 1090,
        occurredOn: '2026-10-05',
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json()).toMatchObject({ amountMinor: 1000, toAmountMinor: 1090 });
      expect(await balance(user, a.id)).toBe(9000);
      expect(await balance(user, usd.id)).toBe(1090);
      await expectLedgerConsistent(ctx.owner);
    });

    it('accepts an equal toAmount and rejects a different one for the same currency', async () => {
      const { user, a, b } = await setup();
      const payload = {
        fromWalletId: a.id,
        toWalletId: b.id,
        amountMinor: 500,
        occurredOn: '2026-10-05',
      };
      expect(
        (await call('POST', '/api/v1/transfers', user.headers, { ...payload, toAmountMinor: 500 }))
          .statusCode,
      ).toBe(201);
      const bad = await call('POST', '/api/v1/transfers', user.headers, {
        ...payload,
        toAmountMinor: 499,
      });
      expect(bad.statusCode).toBe(422);
      expect(code(bad)).toBe('TO_AMOUNT_MISMATCH');
    });

    it('rejects the same wallet on both sides, even for ids that do not exist', async () => {
      const { user, a } = await setup();
      for (const id of [a.id, '0197f8a0-0000-7000-8000-00000000dead']) {
        const res = await call('POST', '/api/v1/transfers', user.headers, {
          fromWalletId: id,
          toWalletId: id,
          amountMinor: 1,
          occurredOn: '2026-10-05',
        });
        expect(res.statusCode).toBe(422);
        expect(code(res)).toBe('SAME_WALLET_TRANSFER');
      }
    });

    it('rejects archived, foreign and unknown wallets', async () => {
      const { user, a, b } = await setup();
      const mallory = await registerUser(ctx.app);
      const foreign = await createWallet(ctx.app, mallory, { currency: 'EUR' });
      await call('POST', `/api/v1/wallets/${b.id}/archive`, user.headers);
      const archived = await call('POST', '/api/v1/transfers', user.headers, {
        fromWalletId: a.id,
        toWalletId: b.id,
        amountMinor: 1,
        occurredOn: '2026-10-05',
      });
      expect(archived.statusCode).toBe(409);
      expect(code(archived)).toBe('WALLET_ARCHIVED');
      const unknown = '0197f8a0-0000-7000-8000-00000000dead';
      for (const [fromWalletId, toWalletId] of [
        [a.id, foreign.id],
        [foreign.id, a.id],
        [a.id, unknown],
        [unknown, a.id],
      ]) {
        const res = await call('POST', '/api/v1/transfers', user.headers, {
          fromWalletId,
          toWalletId,
          amountMinor: 1,
          occurredOn: '2026-10-05',
        });
        expect(res.statusCode).toBe(422);
        expect(code(res)).toBe('INVALID_REFERENCE');
      }
      expect(await balance(mallory, foreign.id)).toBe(0);
    });

    it('leaves nothing behind when the credit would overflow the balance range', async () => {
      const { user, a } = await setup();
      const full = await createWallet(ctx.app, user, {
        currency: 'EUR',
        openingBalanceMinor: 100_000_000_000_000,
      });
      const res = await call('POST', '/api/v1/transfers', user.headers, {
        fromWalletId: a.id,
        toWalletId: full.id,
        amountMinor: 1,
        occurredOn: '2026-10-05',
      });
      expect(res.statusCode).toBe(400);
      const rows = await ctx.owner.query(
        'select (select count(*)::int from transfers) as t, (select count(*)::int from transactions) as x',
      );
      expect(rows.rows[0]).toEqual({ t: 0, x: 0 });
      expect(await balance(user, a.id)).toBe(10_000);
    });

    it.each([
      ['unknown field', { userId: 'x' }],
      ['zero amount', { amountMinor: 0 }],
      ['fractional amount', { amountMinor: 1.5 }],
      ['bad date', { occurredOn: '2026-13-01' }],
      ['long note', { note: 'n'.repeat(501) }],
    ])('rejects %s with 400', async (_name, patch) => {
      const { user, a, b } = await setup();
      const res = await call('POST', '/api/v1/transfers', user.headers, {
        fromWalletId: a.id,
        toWalletId: b.id,
        amountMinor: 100,
        occurredOn: '2026-10-05',
        ...patch,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('read, ownership and delete', () => {
    it('hides other users transfers on every verb', async () => {
      const { user, a, b } = await setup();
      const mallory = await registerUser(ctx.app);
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: a.id,
        toWalletId: b.id,
      });
      const url = `/api/v1/transfers/${transfer.id}`;
      expect((await call('GET', url, user.headers)).statusCode).toBe(200);
      const attempts = [
        call('GET', url, mallory.headers),
        call('PATCH', url, mallory.headers, { amountMinor: 1 }),
        call('DELETE', url, mallory.headers),
      ];
      for (const res of await Promise.all(attempts)) expect(res.statusCode).toBe(404);
      expect(await balance(user, a.id)).toBe(9000);
    });

    it('deletes both legs together and restores both balances', async () => {
      const { user, a, b } = await setup();
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: a.id,
        toWalletId: b.id,
        amountMinor: 4000,
      });
      expect(
        (await call('DELETE', `/api/v1/transfers/${transfer.id}`, user.headers)).statusCode,
      ).toBe(204);
      expect((await call('GET', `/api/v1/transfers/${transfer.id}`, user.headers)).statusCode).toBe(
        404,
      );
      expect(await balance(user, a.id)).toBe(10_000);
      expect(await balance(user, b.id)).toBe(0);
      const legs = await ctx.owner.query('select count(*)::int as n from transactions');
      expect(legs.rows[0].n).toBe(0);
      await expectLedgerConsistent(ctx.owner);
    });

    it('refuses to delete or edit a transfer that touches an archived wallet', async () => {
      const { user, a, b } = await setup();
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: a.id,
        toWalletId: b.id,
      });
      await call('POST', `/api/v1/wallets/${b.id}/archive`, user.headers);
      const del = await call('DELETE', `/api/v1/transfers/${transfer.id}`, user.headers);
      const patch = await call('PATCH', `/api/v1/transfers/${transfer.id}`, user.headers, {
        amountMinor: 5,
      });
      for (const res of [del, patch]) {
        expect(res.statusCode).toBe(409);
        expect(code(res)).toBe('WALLET_ARCHIVED');
      }
    });
  });

  describe('update', () => {
    it('changes amount, date and note on both legs and rebalances', async () => {
      const { user, a, b } = await setup();
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: a.id,
        toWalletId: b.id,
        amountMinor: 1000,
      });
      const res = await call('PATCH', `/api/v1/transfers/${transfer.id}`, user.headers, {
        amountMinor: 2000,
        occurredOn: '2026-09-15',
        note: 'fixed',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        amountMinor: 2000,
        toAmountMinor: 2000,
        occurredOn: '2026-09-15',
        note: 'fixed',
      });
      expect(await balance(user, a.id)).toBe(8000);
      expect(await balance(user, b.id)).toBe(2000);
      const cleared = await call('PATCH', `/api/v1/transfers/${transfer.id}`, user.headers, {
        note: null,
      });
      expect(cleared.json().note).toBeNull();
      await expectLedgerConsistent(ctx.owner);
    });

    it('moves a leg to another wallet and applies currency rules to the resulting state', async () => {
      const { user, a, b, usd } = await setup();
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: a.id,
        toWalletId: b.id,
        amountMinor: 1000,
      });
      const needsAmount = await call('PATCH', `/api/v1/transfers/${transfer.id}`, user.headers, {
        toWalletId: usd.id,
      });
      expect(needsAmount.statusCode).toBe(422);
      expect(code(needsAmount)).toBe('TO_AMOUNT_REQUIRED');
      const moved = await call('PATCH', `/api/v1/transfers/${transfer.id}`, user.headers, {
        toWalletId: usd.id,
        toAmountMinor: 1100,
      });
      expect(moved.statusCode).toBe(200);
      expect(moved.json()).toMatchObject({ toWallet: { id: usd.id }, toAmountMinor: 1100 });
      expect(await balance(user, b.id)).toBe(0);
      expect(await balance(user, usd.id)).toBe(1100);
      const sameWallet = await call('PATCH', `/api/v1/transfers/${transfer.id}`, user.headers, {
        toWalletId: a.id,
      });
      expect(code(sameWallet)).toBe('SAME_WALLET_TRANSFER');
      const mismatch = await call('PATCH', `/api/v1/transfers/${transfer.id}`, user.headers, {
        toWalletId: b.id,
        toAmountMinor: 3,
      });
      expect(code(mismatch)).toBe('TO_AMOUNT_MISMATCH');
      await expectLedgerConsistent(ctx.owner);
    });

    it('cannot target another user wallet', async () => {
      const { user, a, b } = await setup();
      const mallory = await registerUser(ctx.app);
      const foreign = await createWallet(ctx.app, mallory, { currency: 'EUR' });
      const transfer = await createTransfer(ctx.app, user, {
        fromWalletId: a.id,
        toWalletId: b.id,
      });
      const res = await call('PATCH', `/api/v1/transfers/${transfer.id}`, user.headers, {
        toWalletId: foreign.id,
      });
      expect(res.statusCode).toBe(422);
      expect(code(res)).toBe('INVALID_REFERENCE');
      expect(await balance(mallory, foreign.id)).toBe(0);
    });
  });

  describe('concurrency', () => {
    it('handles opposite-direction transfers between the same wallets without deadlock', async () => {
      const { user, a, b } = await setup();
      const requests = Array.from({ length: 12 }, (_, i) =>
        call('POST', '/api/v1/transfers', user.headers, {
          fromWalletId: i % 2 === 0 ? a.id : b.id,
          toWalletId: i % 2 === 0 ? b.id : a.id,
          amountMinor: 100,
          occurredOn: '2026-10-05',
        }),
      );
      const results = await Promise.all(requests);
      expect(results.map((r) => r.statusCode)).toEqual(Array(12).fill(201));
      expect(await balance(user, a.id)).toBe(10_000);
      expect(await balance(user, b.id)).toBe(0);
      await expectLedgerConsistent(ctx.owner);
    });
  });
});
