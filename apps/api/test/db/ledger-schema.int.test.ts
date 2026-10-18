import { sql, type Kysely, type RawBuilder, type Transaction } from 'kysely';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createKysely } from '../../src/platform/db/client.js';
import type { Database } from '../../src/platform/db/database.js';
import { pgTypes } from '../../src/platform/db/pg-types.js';
import { dbTestInfo, describeDb, truncateAll } from '../support/db.js';

// Schema behaviour for E3-F1-S1 (wallets), E4-F1-S1 (categories) and E5-F1-S1 (transfers and
// transactions): database design notes 5, 7.5 to 7.8, 8 and 9. Runs as the owner role, with the
// driver type mapping, so bigint arrives as number and date as 'YYYY-MM-DD'.

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA';
const MAX = 100_000_000_000_000; // 10^14, the money bound (database design notes 5).

type Db = Kysely<Database> | Transaction<Database>;

describeDb('ledger schema: wallets, categories, transfers, transactions (real PostgreSQL)', () => {
  let pool: pg.Pool;
  let db: Kysely<Database>;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: dbTestInfo()!.ownerUrl, max: 3, types: pgTypes });
    db = createKysely(pool);
  });
  afterAll(async () => {
    await db.destroy();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  const rejects = (promise: Promise<unknown>, code: string, constraint?: string) =>
    expect(promise).rejects.toMatchObject(constraint ? { code, constraint } : { code });

  async function insertUser(email: string): Promise<string> {
    const row = await db
      .insertInto('users')
      .values({ email, passwordHash: HASH, displayName: 'User' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  // Inserts below cast through `never` so tests can also send values the database must reject.
  async function insertWallet(
    userId: string,
    overrides: Partial<{
      name: string;
      type: string;
      currency: string;
      openingBalanceMinor: number;
      archivedAt: Date | null;
    }> = {},
    handle: Db = db,
  ): Promise<string> {
    const row = await handle
      .insertInto('wallets')
      .values({ userId, name: 'Wallet', type: 'bank', currency: 'USD', ...overrides } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function insertCategory(
    values: Partial<{
      ownerUserId: string | null;
      systemKey: string | null;
      name: string;
      type: string;
      icon: string;
      color: string;
      retiredAt: Date | null;
    }>,
  ): Promise<string> {
    const row = await db
      .insertInto('categories')
      .values({ name: 'Custom', type: 'expense', icon: 'tag', color: 'slate', ...values } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function systemCategory(systemKey: string): Promise<string> {
    const row = await db
      .selectFrom('categories')
      .select('id')
      .where('systemKey', '=', systemKey)
      .executeTakeFirstOrThrow();
    return row.id;
  }

  interface TxnValues {
    userId: string;
    walletId: string;
    type: string;
    categoryId: string | null;
    amountMinor: number;
    currency: string;
    occurredOn: string;
    note: string | null;
    transferId: string | null;
    transferDirection: string | null;
  }

  async function insertTxn(values: Partial<TxnValues>, handle: Db = db): Promise<string> {
    const row = await handle
      .insertInto('transactions')
      .values({
        type: 'expense',
        amountMinor: 1000,
        currency: 'USD',
        occurredOn: '2026-10-01',
        ...values,
      } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function ledger(walletId: string): Promise<number> {
    const row = await db
      .selectFrom('wallets')
      .select('ledgerBalanceMinor')
      .where('id', '=', walletId)
      .executeTakeFirstOrThrow();
    return row.ledgerBalanceMinor;
  }

  /** Inserts a transfer header and the given legs in one transaction (pair checked at commit). */
  async function transfer(
    userId: string,
    legs: Array<Partial<TxnValues> & { walletId: string; transferDirection: string | null }>,
    headerUserId: string = userId,
  ): Promise<string> {
    return db.transaction().execute(async (trx) => {
      const header = await trx
        .insertInto('transfers')
        .values({ userId: headerUserId })
        .returning('id')
        .executeTakeFirstOrThrow();
      for (const leg of legs) {
        await insertTxn(
          { userId, type: 'transfer', categoryId: null, transferId: header.id, ...leg },
          trx,
        );
      }
      return header.id;
    });
  }

  describe('wallets (E3-F1-S1)', () => {
    it('accepts cash, bank, card and savings with integer minor-unit money defaults', async () => {
      const userId = await insertUser('w1@example.com');
      for (const type of ['cash', 'bank', 'card', 'savings']) {
        await insertWallet(userId, { name: type, type });
      }
      const rows = await db
        .selectFrom('wallets')
        .select(['type', 'currency', 'openingBalanceMinor', 'ledgerBalanceMinor', 'archivedAt'])
        .where('userId', '=', userId)
        .orderBy('type')
        .execute();
      expect(rows.map((r) => r.type)).toEqual(['bank', 'card', 'cash', 'savings']);
      for (const r of rows) {
        expect(r).toMatchObject({
          currency: 'USD',
          openingBalanceMinor: 0,
          ledgerBalanceMinor: 0,
          archivedAt: null,
        });
      }
      const types = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = 'wallets' AND column_name LIKE '%minor' ORDER BY 1`,
      );
      expect(types.rows).toEqual([
        { column_name: 'ledger_balance_minor', data_type: 'bigint' },
        { column_name: 'opening_balance_minor', data_type: 'bigint' },
      ]);
    });

    it('rejects a bad type, currency or name and an out-of-range opening balance', async () => {
      const userId = await insertUser('w2@example.com');
      await rejects(insertWallet(userId, { type: 'crypto' }), '23514', 'ck_wallets__type');
      await rejects(insertWallet(userId, { currency: 'usd' }), '23514', 'ck_wallets__currency');
      await rejects(insertWallet(userId, { currency: 'USDT' }), '23514', 'ck_wallets__currency');
      await rejects(insertWallet(userId, { name: ' Cash' }), '23514', 'ck_wallets__name');
      await rejects(insertWallet(userId, { name: '' }), '23514', 'ck_wallets__name');
      await rejects(insertWallet(userId, { name: 'x'.repeat(61) }), '23514', 'ck_wallets__name');
      // Beyond 10^14 both range checks fail; PostgreSQL reports one of them.
      await rejects(insertWallet(userId, { openingBalanceMinor: MAX + 1 }), '23514');
      await rejects(insertWallet(userId, { openingBalanceMinor: -MAX - 1 }), '23514');
      const max = await insertWallet(userId, { name: 'Max', openingBalanceMinor: MAX });
      await insertWallet(userId, { name: 'Min', openingBalanceMinor: -MAX });

      // With a negative ledger the total stays in range, isolating the opening balance check.
      const groceries = await systemCategory('expense.groceries');
      await insertTxn({ userId, walletId: max, categoryId: groceries, amountMinor: 1 });
      await rejects(
        db
          .updateTable('wallets')
          .set({ openingBalanceMinor: MAX + 1 })
          .where('id', '=', max)
          .execute(),
        '23514',
        'ck_wallets__opening_balance_range',
      );
    });

    it('keeps names unique per user among active wallets, case-insensitively', async () => {
      const a = await insertUser('w3a@example.com');
      const b = await insertUser('w3b@example.com');
      const cash = await insertWallet(a, { name: 'Cash' });
      await rejects(insertWallet(a, { name: 'cash' }), '23505', 'uq_wallets__user_name_active');
      await insertWallet(b, { name: 'Cash' });

      await db
        .updateTable('wallets')
        .set({ archivedAt: new Date() })
        .where('id', '=', cash)
        .execute();
      await insertWallet(a, { name: 'CASH' });
      await rejects(
        db.updateTable('wallets').set({ archivedAt: null }).where('id', '=', cash).execute(),
        '23505',
        'uq_wallets__user_name_active',
      );
    });

    it('has the per-user indexes', async () => {
      const { rows } = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'wallets' ORDER BY 1`,
      );
      expect(rows.map((r) => r.indexname)).toEqual(
        expect.arrayContaining(['ix_wallets__user_id', 'uq_wallets__user_name_active']),
      );
    });

    it('blocks deleting a user that owns wallets (ON DELETE RESTRICT, SQLSTATE 23503)', async () => {
      const userId = await insertUser('w4@example.com');
      await insertWallet(userId);
      await rejects(
        db.deleteFrom('users').where('id', '=', userId).execute(),
        '23503',
        'fk_wallets__user',
      );
    });
  });

  describe('categories (E4-F1-S1)', () => {
    it('supports income and expense types and rejects anything else', async () => {
      const userId = await insertUser('c1@example.com');
      await insertCategory({ ownerUserId: userId, name: 'Side gig', type: 'income' });
      await insertCategory({ ownerUserId: userId, name: 'Snacks', type: 'expense' });
      await rejects(
        insertCategory({ ownerUserId: userId, name: 'Moves', type: 'transfer' }),
        '23514',
        'ck_categories__type',
      );
    });

    it('rejects bad icons, colors, names and system-only fields on user rows', async () => {
      const userId = await insertUser('c2@example.com');
      const mine = { ownerUserId: userId };
      await rejects(insertCategory({ ...mine, icon: 'Bad Icon' }), '23514', 'ck_categories__icon');
      await rejects(insertCategory({ ...mine, color: '#ffffff' }), '23514', 'ck_categories__color');
      await rejects(insertCategory({ ...mine, name: 'Food ' }), '23514', 'ck_categories__name');
      await rejects(
        insertCategory({ ...mine, name: 'x'.repeat(41) }),
        '23514',
        'ck_categories__name',
      );
      await rejects(
        insertCategory({ ...mine, systemKey: 'expense.mine' }),
        '23514',
        'ck_categories__system_only_fields',
      );
      await rejects(
        insertCategory({ ...mine, retiredAt: new Date() }),
        '23514',
        'ck_categories__system_only_fields',
      );
      await rejects(
        insertCategory({ systemKey: 'misc.thing', name: 'Thing' }),
        '23514',
        'ck_categories__system_key',
      );
      await rejects(
        insertCategory({ systemKey: 'expense.groceries', name: 'Groceries 2' }),
        '23505',
        'uq_categories__system_key',
      );
    });

    it('scopes user categories by owner: unique per owner and type, case-insensitively', async () => {
      const a = await insertUser('c3a@example.com');
      const b = await insertUser('c3b@example.com');
      await insertCategory({ ownerUserId: a, name: 'Coffee', type: 'expense' });
      await rejects(
        insertCategory({ ownerUserId: a, name: 'coffee', type: 'expense' }),
        '23505',
        'uq_categories__owner_type_name',
      );
      await insertCategory({ ownerUserId: a, name: 'Coffee', type: 'income' });
      await insertCategory({ ownerUserId: b, name: 'Coffee', type: 'expense' });
      // A user category may share a name with a system category.
      await insertCategory({ ownerUserId: a, name: 'Groceries', type: 'expense' });

      const visibleToA = await db
        .selectFrom('categories')
        .select(['name', 'ownerUserId'])
        .where((eb) => eb.or([eb('ownerUserId', 'is', null), eb('ownerUserId', '=', a)]))
        .where('name', '=', 'Coffee')
        .execute();
      expect(visibleToA).toHaveLength(2);
      expect(visibleToA.every((r) => r.ownerUserId === a)).toBe(true);
    });

    it('keeps system names unique among non-retired system categories', async () => {
      await rejects(
        insertCategory({ name: 'groceries', type: 'expense' }),
        '23505',
        'uq_categories__system_type_name_active',
      );
      const groceries = await systemCategory('expense.groceries');
      await db
        .updateTable('categories')
        .set({ retiredAt: new Date() })
        .where('id', '=', groceries)
        .execute();
      await insertCategory({ name: 'Groceries', type: 'expense' });
      await rejects(
        db.updateTable('categories').set({ retiredAt: null }).where('id', '=', groceries).execute(),
        '23505',
        'uq_categories__system_type_name_active',
      );
    });

    it('never lets the owner of a category change (ck_categories__owner_immutable)', async () => {
      const a = await insertUser('c5a@example.com');
      const b = await insertUser('c5b@example.com');
      const own = await insertCategory({ ownerUserId: a, name: 'Mine' });
      const groceries = await systemCategory('expense.groceries');
      const setOwner = (id: string, owner: string | null) =>
        sql`UPDATE categories SET owner_user_id = ${owner} WHERE id = ${id}`.execute(db);
      await rejects(setOwner(own, b), '23514', 'ck_categories__owner_immutable');
      await rejects(setOwner(own, null), '23514', 'ck_categories__owner_immutable');
      await rejects(setOwner(groceries, a), '23514', 'ck_categories__owner_immutable');
      // Assigning the same owner is not a change, and other columns stay editable.
      await setOwner(own, a);
      await setOwner(groceries, null);
      await db.updateTable('categories').set({ name: 'Renamed' }).where('id', '=', own).execute();
    });

    it('blocks deleting a user who owns categories (ON DELETE RESTRICT, SQLSTATE 23503)', async () => {
      const userId = await insertUser('c4@example.com');
      await insertCategory({ ownerUserId: userId });
      await rejects(
        db.deleteFrom('users').where('id', '=', userId).execute(),
        '23503',
        'fk_categories__owner',
      );
    });
  });

  describe('transactions (E5-F1-S1)', () => {
    let userId: string;
    let otherUserId: string;
    let wallet: string;
    let wallet2: string;
    let eurWallet: string;
    let groceries: string;
    let salary: string;

    beforeEach(async () => {
      userId = await insertUser('t@example.com');
      otherUserId = await insertUser('t-other@example.com');
      wallet = await insertWallet(userId, { name: 'Checking' });
      wallet2 = await insertWallet(userId, { name: 'Savings', type: 'savings' });
      eurWallet = await insertWallet(userId, { name: 'Euro', currency: 'EUR' });
      groceries = await systemCategory('expense.groceries');
      salary = await systemCategory('income.salary');
    });

    it('stores income and expense with a generated signed amount and keeps the wallet balance', async () => {
      const income = await insertTxn({
        userId,
        walletId: wallet,
        type: 'income',
        categoryId: salary,
        amountMinor: 10_000,
      });
      const spend = await insertTxn({
        userId,
        walletId: wallet,
        categoryId: groceries,
        amountMinor: 2_500,
      });
      const signed = await db
        .selectFrom('transactions')
        .select(['id', 'signedAmountMinor', 'occurredOn'])
        .orderBy('amountMinor', 'desc')
        .execute();
      expect(signed).toEqual([
        { id: income, signedAmountMinor: 10_000, occurredOn: '2026-10-01' },
        { id: spend, signedAmountMinor: -2_500, occurredOn: '2026-10-01' },
      ]);
      expect(await ledger(wallet)).toBe(7_500);

      await db
        .updateTable('transactions')
        .set({ amountMinor: 3_000 })
        .where('id', '=', spend)
        .execute();
      expect(await ledger(wallet)).toBe(7_000);

      // Moving a row between wallets moves its amount.
      await db
        .updateTable('transactions')
        .set({ walletId: wallet2 })
        .where('id', '=', spend)
        .execute();
      expect([await ledger(wallet), await ledger(wallet2)]).toEqual([10_000, -3_000]);

      // Balance maintenance does not bump the wallet's updated_at (user-visible fields only).
      const before = await db
        .selectFrom('wallets')
        .select('updatedAt')
        .where('id', '=', wallet)
        .executeTakeFirstOrThrow();
      await pool.query('SELECT pg_sleep(0.01)');
      await db.deleteFrom('transactions').where('id', '=', income).execute();
      const after = await db
        .selectFrom('wallets')
        .select(['updatedAt', 'ledgerBalanceMinor'])
        .where('id', '=', wallet)
        .executeTakeFirstOrThrow();
      expect(after.ledgerBalanceMinor).toBe(0);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it('applies one difference in the same wallet and skips the wallet write when nothing changed', async () => {
      const id = await insertTxn({ userId, walletId: wallet, categoryId: groceries });
      const version = async () =>
        (
          await sql<{
            v: string;
          }>`SELECT xmin::text AS v FROM wallets WHERE id = ${wallet}`.execute(db)
        ).rows[0]!.v;
      const before = await version();
      // wallet_id and amount_minor are in the SET list (the trigger fires), but the signed amount
      // is unchanged, so the wallet row is not rewritten (its xmin stays the same).
      await sql`UPDATE transactions SET wallet_id = ${wallet}, amount_minor = 1000, note = 'n'
                 WHERE id = ${id}`.execute(db);
      expect(await version()).toBe(before);
      expect(await ledger(wallet)).toBe(-1_000);

      await db
        .updateTable('transactions')
        .set({ amountMinor: 1_500 })
        .where('id', '=', id)
        .execute();
      expect(await ledger(wallet)).toBe(-1_500);
      await sql`UPDATE transactions SET type = 'income', category_id = ${salary} WHERE id = ${id}`.execute(
        db,
      );
      expect(await ledger(wallet)).toBe(1_500);
    });

    it('rejects zero, negative and oversized amounts', async () => {
      const base = { userId, walletId: wallet, categoryId: groceries };
      for (const amountMinor of [0, -1, -500, MAX + 1]) {
        await rejects(
          insertTxn({ ...base, amountMinor }),
          '23514',
          'ck_transactions__amount_range',
        );
      }
      await insertTxn({ ...base, amountMinor: 1 });
      await rejects(
        db.updateTable('transactions').set({ amountMinor: -1 }).execute(),
        '23514',
        'ck_transactions__amount_range',
      );
    });

    it('rejects a bad type, currency, date or note', async () => {
      const base = { userId, walletId: wallet, categoryId: groceries };
      await rejects(insertTxn({ ...base, type: 'refund' }), '23514', 'ck_transactions__type');
      await rejects(insertTxn({ ...base, currency: 'usd' }), '23514', 'ck_transactions__currency');
      await rejects(
        insertTxn({ ...base, occurredOn: '1899-12-31' }),
        '23514',
        'ck_transactions__occurred_on_range',
      );
      await rejects(
        insertTxn({ ...base, occurredOn: '2101-01-01' }),
        '23514',
        'ck_transactions__occurred_on_range',
      );
      await rejects(insertTxn({ ...base, note: '' }), '23514', 'ck_transactions__note');
      await rejects(
        insertTxn({ ...base, note: 'x'.repeat(501) }),
        '23514',
        'ck_transactions__note',
      );
      await insertTxn({ ...base, note: 'x'.repeat(500) });
    });

    it('requires the currency of the wallet (composite foreign key)', async () => {
      await rejects(
        insertTxn({ userId, walletId: wallet, categoryId: groceries, currency: 'EUR' }),
        '23503',
        'fk_transactions__wallet',
      );
      await insertTxn({ userId, walletId: eurWallet, categoryId: groceries, currency: 'EUR' });
    });

    it('enforces the shape: category if and only if not a transfer, transfer fields together', async () => {
      await rejects(
        insertTxn({ userId, walletId: wallet, categoryId: null }),
        '23514',
        'ck_transactions__transfer_shape',
      );
      await rejects(
        insertTxn({ userId, walletId: wallet, type: 'transfer', categoryId: null }),
        '23514',
        'ck_transactions__transfer_shape',
      );
      await rejects(
        insertTxn({
          userId,
          walletId: wallet,
          categoryId: groceries,
          transferDirection: 'out',
        }),
        '23514',
        'ck_transactions__transfer_shape',
      );
      await rejects(
        insertTxn({
          userId,
          walletId: wallet,
          categoryId: groceries,
          transferDirection: 'sideways',
        }),
        '23514',
        'ck_transactions__transfer_direction',
      );
    });

    it('keeps wallet and category references inside the owner (tenant isolation)', async () => {
      const foreignWallet = await insertWallet(otherUserId, { name: 'Theirs' });
      const foreignCategory = await insertCategory({ ownerUserId: otherUserId, name: 'Theirs' });
      await rejects(
        insertTxn({ userId, walletId: foreignWallet, categoryId: groceries }),
        '23503',
        'fk_transactions__wallet',
      );
      await rejects(
        insertTxn({ userId, walletId: wallet, categoryId: foreignCategory }),
        '23503',
        'fk_category_accessible',
      );
      const own = await insertCategory({ ownerUserId: userId, name: 'Mine' });
      const id = await insertTxn({ userId, walletId: wallet, categoryId: own });
      await rejects(
        db
          .updateTable('transactions')
          .set({ categoryId: foreignCategory })
          .where('id', '=', id)
          .execute(),
        '23503',
        'fk_category_accessible',
      );
    });

    it('requires the category type to match the transaction type', async () => {
      await rejects(
        insertTxn({ userId, walletId: wallet, type: 'income', categoryId: groceries }),
        '23503',
        'fk_transactions__category',
      );
      await rejects(
        insertTxn({ userId, walletId: wallet, type: 'expense', categoryId: salary }),
        '23503',
        'fk_transactions__category',
      );
    });

    it('restricts deleting or rekeying referenced wallets and categories (SQLSTATE 23503)', async () => {
      const own = await insertCategory({ ownerUserId: userId, name: 'Mine' });
      await insertTxn({ userId, walletId: wallet, categoryId: own });

      await rejects(
        db.deleteFrom('wallets').where('id', '=', wallet).execute(),
        '23503',
        'fk_transactions__wallet',
      );
      await rejects(
        db.updateTable('wallets').set({ currency: 'EUR' }).where('id', '=', wallet).execute(),
        '23503',
        'fk_transactions__wallet',
      );
      await rejects(
        db.deleteFrom('categories').where('id', '=', own).execute(),
        '23503',
        'fk_transactions__category',
      );
      await rejects(
        sql`UPDATE categories SET type = 'income' WHERE id = ${own}`.execute(db),
        '23503',
        'fk_transactions__category',
      );
      await rejects(db.deleteFrom('users').where('id', '=', userId).execute(), '23503');

      // An unused wallet can change currency and be deleted.
      await db.updateTable('wallets').set({ currency: 'GBP' }).where('id', '=', wallet2).execute();
      await db.deleteFrom('wallets').where('id', '=', wallet2).execute();
    });

    it('rejects a write that would push the wallet balance beyond 10^14', async () => {
      const rich = await insertWallet(userId, { name: 'Rich', openingBalanceMinor: MAX });
      await rejects(
        insertTxn({ userId, walletId: rich, type: 'income', categoryId: salary, amountMinor: 1 }),
        '23514',
        'ck_wallets__balance_range',
      );
    });

    describe('transfers', () => {
      it('commits a header with an out and an in leg and moves the balance', async () => {
        const id = await transfer(userId, [
          { walletId: wallet, transferDirection: 'out', amountMinor: 5_000, note: 'Move' },
          { walletId: wallet2, transferDirection: 'in', amountMinor: 5_000, note: 'Move' },
        ]);
        const legs = await db
          .selectFrom('transactions')
          .select(['transferDirection', 'signedAmountMinor', 'categoryId'])
          .where('transferId', '=', id)
          .orderBy('transferDirection', 'desc')
          .execute();
        expect(legs).toEqual([
          { transferDirection: 'out', signedAmountMinor: -5_000, categoryId: null },
          { transferDirection: 'in', signedAmountMinor: 5_000, categoryId: null },
        ]);
        expect([await ledger(wallet), await ledger(wallet2)]).toEqual([-5_000, 5_000]);
      });

      it('allows different amounts only across currencies', async () => {
        await transfer(userId, [
          { walletId: wallet, transferDirection: 'out', amountMinor: 1_000 },
          { walletId: eurWallet, currency: 'EUR', transferDirection: 'in', amountMinor: 920 },
        ]);
        await rejects(
          transfer(userId, [
            { walletId: wallet, transferDirection: 'out', amountMinor: 1_000 },
            { walletId: wallet2, transferDirection: 'in', amountMinor: 999 },
          ]),
          '23514',
          'ck_transfers__pair',
        );
      });

      it('rejects incomplete or inconsistent transfers at commit', async () => {
        const out = { walletId: wallet, transferDirection: 'out' };
        const inn = { walletId: wallet2, transferDirection: 'in' };
        const cases: Array<Parameters<typeof transfer>[1]> = [
          [],
          [out],
          [inn],
          [out, { ...inn, walletId: wallet }],
          [out, { ...inn, occurredOn: '2026-10-02' }],
          [out, { ...inn, note: 'Different' }],
        ];
        for (const legs of cases) {
          await rejects(transfer(userId, legs), '23514', 'ck_transfers__pair');
        }
        expect(await db.selectFrom('transfers').select('id').execute()).toEqual([]);
        expect([await ledger(wallet), await ledger(wallet2)]).toEqual([0, 0]);
      });

      it('allows only one leg per direction', async () => {
        await rejects(
          transfer(userId, [
            { walletId: wallet, transferDirection: 'out' },
            { walletId: wallet2, transferDirection: 'out' },
          ]),
          '23505',
          'uq_transactions__transfer_leg',
        );
      });

      it('rejects legs under another user transfer header', async () => {
        await rejects(
          transfer(
            userId,
            [
              { walletId: wallet, transferDirection: 'out' },
              { walletId: wallet2, transferDirection: 'in' },
            ],
            otherUserId,
          ),
          '23503',
          'fk_transactions__transfer',
        );
      });

      it('prevents orphaned legs: deleting one leg or turning it into an expense fails', async () => {
        const id = await transfer(userId, [
          { walletId: wallet, transferDirection: 'out' },
          { walletId: wallet2, transferDirection: 'in' },
        ]);
        const inLeg = await db
          .selectFrom('transactions')
          .select('id')
          .where('transferId', '=', id)
          .where('transferDirection', '=', 'in')
          .executeTakeFirstOrThrow();

        await rejects(
          db.deleteFrom('transactions').where('id', '=', inLeg.id).execute(),
          '23514',
          'ck_transfers__pair',
        );
        await rejects(
          db
            .updateTable('transactions')
            .set({
              type: 'expense',
              categoryId: groceries,
              transferId: null,
              transferDirection: null,
            })
            .where('id', '=', inLeg.id)
            .execute(),
          '23514',
          'ck_transfers__pair',
        );
        expect(
          await db.selectFrom('transactions').select('id').where('transferId', '=', id).execute(),
        ).toHaveLength(2);
      });

      it('deleting the header removes both legs and restores both balances', async () => {
        const id = await transfer(userId, [
          { walletId: wallet, transferDirection: 'out', amountMinor: 700 },
          { walletId: wallet2, transferDirection: 'in', amountMinor: 700 },
        ]);
        await db.deleteFrom('transfers').where('id', '=', id).execute();
        expect(await db.selectFrom('transactions').select('id').execute()).toEqual([]);
        expect([await ledger(wallet), await ledger(wallet2)]).toEqual([0, 0]);
      });

      it('checks the pair only for transfer legs (one WHEN-filtered trigger per event)', async () => {
        const { rows } = await pool.query(
          `SELECT tgname, tgdeferrable, tginitdeferred, tgqual IS NOT NULL AS filtered
             FROM pg_trigger
            WHERE tgrelid = 'transactions'::regclass AND tgname LIKE 'ct_transactions__transfer_pair%'
            ORDER BY tgname`,
        );
        expect(rows).toEqual(
          ['delete', 'insert', 'update'].map((event) => ({
            tgname: `ct_transactions__transfer_pair_${event}`,
            tgdeferrable: true,
            tginitdeferred: true,
            filtered: true,
          })),
        );
        const idx = await pool.query(
          `SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_transfers__user_id'`,
        );
        expect(idx.rows[0]?.indexdef).toContain('(user_id)');
      });

      describe('concurrent writers of one transfer', () => {
        const clients: pg.Client[] = [];
        const connect = async () => {
          const client = new pg.Client({ connectionString: dbTestInfo()!.ownerUrl });
          await client.connect();
          clients.push(client);
          return client;
        };
        afterEach(async () => {
          await Promise.all(clients.splice(0).map((c) => c.end()));
        });

        async function legsOf(id: string) {
          const rows = await db
            .selectFrom('transactions')
            .select(['id', 'transferDirection', 'walletId', 'currency', 'amountMinor'])
            .where('transferId', '=', id)
            .orderBy('transferDirection', 'desc')
            .execute();
          return { out: rows[0]!, in: rows[1]! };
        }

        async function waitUntilLockWait(observer: pg.Client, pid: number): Promise<void> {
          for (let i = 0; i < 200; i++) {
            const { rows } = await observer.query(
              `SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`,
              [pid],
            );
            if (rows[0]?.wait_event_type === 'Lock') return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          throw new Error(`backend ${pid} never waited on a lock`);
        }

        it('rejects two transactions that each move one leg into the same wallet', async () => {
          const third = await insertWallet(userId, { name: 'Third' });
          const id = await transfer(userId, [
            { walletId: wallet, transferDirection: 'out', amountMinor: 500 },
            { walletId: wallet2, transferDirection: 'in', amountMinor: 500 },
          ]);
          const legs = await legsOf(id);
          const [c1, c2] = [await connect(), await connect()];
          const move = 'UPDATE transactions SET wallet_id = $1 WHERE id = $2';

          await c1.query('BEGIN');
          await c1.query(move, [third, legs.out.id]);
          await c2.query('BEGIN');
          const second = c2.query(move, [third, legs.in.id]).then(() => c2.query('COMMIT'));
          await c1.query('COMMIT');
          await expect(second).rejects.toMatchObject({
            code: '23514',
            constraint: 'ck_transfers__pair',
          });

          const after = await legsOf(id);
          expect([after.out.walletId, after.in.walletId]).toEqual([third, wallet2]);
          expect([await ledger(wallet), await ledger(wallet2), await ledger(third)]).toEqual([
            0, 500, -500,
          ]);
        });

        it('serializes the deferred pair checks on the header lock (no lost check)', async () => {
          // Each change alone leaves a valid pair; together they do not. They touch different
          // legs and different wallets, so only the header lock taken by the check orders them.
          const id = await transfer(userId, [
            { walletId: wallet, transferDirection: 'out', amountMinor: 1_000 },
            { walletId: eurWallet, currency: 'EUR', transferDirection: 'in', amountMinor: 900 },
          ]);
          const legs = await legsOf(id);
          const [c1, c2, observer] = [await connect(), await connect(), await connect()];
          const c2pid = (await c2.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
            .pid;

          // c1: the in leg becomes USD 1000 in wallet2 (same currency, equal amounts: valid).
          await c1.query('BEGIN');
          await c1.query(
            `UPDATE transactions SET wallet_id = $1, currency = 'USD', amount_minor = 1000 WHERE id = $2`,
            [wallet2, legs.in.id],
          );
          await c1.query('SET CONSTRAINTS ALL IMMEDIATE'); // runs the check now, holding the header
          // c2: the out leg becomes USD 1100 (against EUR 900 it is still valid).
          await c2.query('BEGIN');
          await c2.query('UPDATE transactions SET amount_minor = 1100 WHERE id = $1', [
            legs.out.id,
          ]);
          const check = c2.query('SET CONSTRAINTS ALL IMMEDIATE');
          check.catch(() => undefined);
          await waitUntilLockWait(observer, c2pid);
          await c1.query('COMMIT');

          // After c1 commits, c2's check sees USD 1100 against USD 1000 and fails.
          await expect(check).rejects.toMatchObject({
            code: '23514',
            constraint: 'ck_transfers__pair',
          });
          await c2.query('ROLLBACK');
          const after = await legsOf(id);
          expect([after.out.amountMinor, after.in.amountMinor]).toEqual([1_000, 1_000]);
        });
      });
    });

    it('has indexes that serve filtering by user and date, wallet and category', async () => {
      // A realistic spread so the planner has statistics: 600 rows over two users, three wallets,
      // ten expense categories and a year of dates.
      const categories = (
        await db
          .selectFrom('categories')
          .select('id')
          .where('type', '=', 'expense')
          .where('ownerUserId', 'is', null)
          .orderBy('systemKey')
          .limit(10)
          .execute()
      ).map((c) => c.id);
      const otherWallet = await insertWallet(otherUserId, { name: 'Other' });
      await sql`
        INSERT INTO transactions (user_id, wallet_id, type, category_id, amount_minor, currency, occurred_on)
        SELECT u.user_id, u.wallet_id, 'expense', (${categories}::uuid[])[1 + g % 10], 100 + g, 'USD',
               DATE '2025-01-01' + (g % 365)
          FROM (VALUES (${userId}::uuid, ${wallet}::uuid),
                       (${userId}::uuid, ${wallet2}::uuid),
                       (${otherUserId}::uuid, ${otherWallet}::uuid)) AS u (user_id, wallet_id),
               generate_series(1, 200) AS g`.execute(db);
      await sql`ANALYZE transactions`.execute(db);
      expect(categories).toContain(groceries);

      const plan = (query: RawBuilder<unknown>) =>
        db.transaction().execute(async (trx) => {
          // Small tables favour sequential scans; disable them to see which index can serve.
          await sql`SET LOCAL enable_seqscan = off`.execute(trx);
          const { rows } = await sql<{ 'QUERY PLAN': string }>`EXPLAIN ${query}`.execute(trx);
          return rows.map((r) => r['QUERY PLAN']).join('\n');
        });

      const byUserDate = await plan(sql`
        SELECT id FROM transactions
         WHERE user_id = ${userId} AND occurred_on BETWEEN ${'2025-03-01'} AND ${'2025-03-31'}
         ORDER BY occurred_on DESC, created_at DESC, id DESC LIMIT 50`);
      expect(byUserDate).toContain('ix_transactions__user_date');

      const byWallet = await plan(sql`
        SELECT id FROM transactions WHERE wallet_id = ${wallet} ORDER BY occurred_on, created_at, id`);
      expect(byWallet).toContain('ix_transactions__wallet_date');

      const byCategory = await plan(sql`
        SELECT id FROM transactions
         WHERE category_id = ${groceries} AND user_id = ${userId}
         ORDER BY occurred_on DESC, created_at DESC, id DESC`);
      expect(byCategory).toContain('ix_transactions__category_user_date');

      const { rows } = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'transactions' ORDER BY 1`,
      );
      expect(rows.map((r) => r.indexname)).toEqual([
        'ix_transactions__category_user_date',
        'ix_transactions__created_at_brin',
        // Added by the create-recurring migration (E8-F1-S1), FK support for template delete.
        'ix_transactions__recurring_template',
        'ix_transactions__user_amount',
        'ix_transactions__user_date',
        'ix_transactions__user_note_trgm',
        'ix_transactions__wallet_date',
        'pk_transactions',
        'uq_transactions__transfer_leg',
      ]);
      // The trigger kept the balances consistent with the bulk insert (C-02 invariant).
      const drift = await sql<{ id: string }>`
        SELECT w.id FROM wallets w
          LEFT JOIN transactions t ON t.wallet_id = w.id
         GROUP BY w.id, w.ledger_balance_minor
        HAVING w.ledger_balance_minor <> COALESCE(SUM(t.signed_amount_minor), 0)`.execute(db);
      expect(drift.rows).toEqual([]);
    });
  });
});
