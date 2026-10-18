import { randomBytes } from 'node:crypto';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@midas/shared';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createKysely } from '../../src/platform/db/client.js';
import type { Database } from '../../src/platform/db/database.js';
import { pgTypes } from '../../src/platform/db/pg-types.js';
import { dbTestInfo, describeDb, truncateAll } from '../support/db.js';

// Schema behaviour for E6-F1-S1 (budgets), E8-F1-S1 (recurring templates and runs) and E9-F1-S1
// (audit log and role fields): database design notes 7.2, 7.9 to 7.11, 8 (AP-10, AP-11, AP-14),
// 9 (C-03, C-09, C-10) and 13.1. Runs as the owner role with the driver type mapping, except where
// a test switches role on purpose to exercise privileges and the audit immutability trigger.

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA';
const MAX = 100_000_000_000_000; // 10^14, the money bound (database design notes 5).

describeDb('planning and audit schema: budgets, recurring, audit_logs (real PostgreSQL)', () => {
  let pool: pg.Pool;
  let db: Kysely<Database>;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: dbTestInfo()!.ownerUrl, max: 4, types: pgTypes });
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

  async function insertUser(email: string, overrides: Record<string, unknown> = {}) {
    const row = await db
      .insertInto('users')
      .values({ email, passwordHash: HASH, displayName: 'User', ...overrides } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function insertWallet(userId: string, name = 'Wallet', currency = 'USD') {
    const row = await db
      .insertInto('wallets')
      .values({ userId, name, type: 'bank', currency })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function insertCategory(ownerUserId: string | null, name: string, type = 'expense') {
    const row = await db
      .insertInto('categories')
      .values({ ownerUserId, name, type, icon: 'tag', color: 'slate' } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function systemCategory(systemKey: string) {
    const row = await db
      .selectFrom('categories')
      .select('id')
      .where('systemKey', '=', systemKey)
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** EXPLAIN with sequential scans disabled, to see which index can serve a query. */
  const plan = (query: RawBuilder<unknown>) =>
    db.transaction().execute(async (trx) => {
      await sql`SET LOCAL enable_seqscan = off`.execute(trx);
      const { rows } = await sql<{ 'QUERY PLAN': string }>`EXPLAIN ${query}`.execute(trx);
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    });

  const indexesOf = async (table: string) =>
    (
      await pool.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 ORDER BY 1`,
        [table],
      )
    ).rows;

  describe('budgets (E6-F1-S1)', () => {
    let userId: string;
    let groceries: string;

    beforeEach(async () => {
      userId = await insertUser('b@example.com');
      groceries = await systemCategory('expense.groceries');
    });

    const insertBudget = (values: Record<string, unknown>) =>
      db
        .insertInto('budgets')
        .values({
          userId,
          scope: 'overall',
          amountMinor: 50_000,
          currency: 'USD',
          startDate: '2026-10-01',
          ...values,
        } as never)
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((r) => r.id);

    it('supports overall and per-category budgets, monthly by default with an 80% threshold', async () => {
      const overall = await insertBudget({});
      const perCategory = await insertBudget({ scope: 'category', categoryId: groceries });
      const rows = await db
        .selectFrom('budgets')
        .select(['id', 'scope', 'categoryId', 'period', 'warningThresholdPct', 'startDate'])
        .orderBy('scope', 'desc')
        .execute();
      expect(rows).toEqual([
        {
          id: overall,
          scope: 'overall',
          categoryId: null,
          period: 'monthly',
          warningThresholdPct: 80,
          startDate: '2026-10-01',
        },
        {
          id: perCategory,
          scope: 'category',
          categoryId: groceries,
          period: 'monthly',
          warningThresholdPct: 80,
          startDate: '2026-10-01',
        },
      ]);
      const types = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = 'budgets'
            AND column_name IN ('amount_minor', 'warning_threshold_pct', 'start_date') ORDER BY 1`,
      );
      expect(types.rows).toEqual([
        { column_name: 'amount_minor', data_type: 'bigint' },
        { column_name: 'start_date', data_type: 'date' },
        { column_name: 'warning_threshold_pct', data_type: 'smallint' },
      ]);
    });

    it('ties the category to the scope (ck_budgets__scope_shape) and checks the scope', async () => {
      await rejects(insertBudget({ categoryId: groceries }), '23514', 'ck_budgets__scope_shape');
      await rejects(insertBudget({ scope: 'category' }), '23514', 'ck_budgets__scope_shape');
      await rejects(insertBudget({ scope: 'wallet' }), '23514', 'ck_budgets__scope');
    });

    it('rejects bad amounts, currencies, thresholds, periods and out-of-range dates', async () => {
      for (const amountMinor of [0, -1, MAX + 1]) {
        await rejects(insertBudget({ amountMinor }), '23514', 'ck_budgets__amount_range');
      }
      await insertBudget({ amountMinor: MAX });
      await rejects(insertBudget({ currency: 'usd' }), '23514', 'ck_budgets__currency');
      for (const warningThresholdPct of [0, 100]) {
        await rejects(
          insertBudget({ currency: 'EUR', warningThresholdPct }),
          '23514',
          'ck_budgets__threshold',
        );
      }
      await insertBudget({ currency: 'EUR', warningThresholdPct: 1 });
      await insertBudget({ currency: 'GBP', warningThresholdPct: 99 });
      // An unknown period also fails the start-date alignment check; PostgreSQL reports one.
      await rejects(insertBudget({ currency: 'JPY', period: 'daily' }), '23514');
      await rejects(
        insertBudget({ currency: 'JPY', startDate: '1899-12-01' }),
        '23514',
        'ck_budgets__start_date_range',
      );
      await rejects(
        insertBudget({ currency: 'JPY', startDate: '2101-01-01' }),
        '23514',
        'ck_budgets__start_date_range',
      );
    });

    it('requires the start date to be the period start (monthly day 1, yearly 1 Jan, ISO Monday)', async () => {
      const aligned = 'ck_budgets__start_date_aligned';
      await rejects(insertBudget({ startDate: '2026-10-02' }), '23514', aligned);
      await rejects(insertBudget({ period: 'yearly', startDate: '2026-02-01' }), '23514', aligned);
      await rejects(insertBudget({ period: 'weekly', startDate: '2026-10-04' }), '23514', aligned);
      await insertBudget({ startDate: '2026-10-01' });
      await insertBudget({ period: 'yearly', startDate: '2026-01-01' });
      await insertBudget({ period: 'weekly', startDate: '2026-10-05' });
      // An ISO week can start in the previous calendar year.
      await insertBudget({ currency: 'EUR', period: 'weekly', startDate: '2025-12-29' });
    });

    it('allows one budget per user, scope or category, period and currency (NULLS NOT DISTINCT)', async () => {
      const unique = 'uq_budgets__user_category_period_currency';
      await insertBudget({});
      await rejects(insertBudget({ amountMinor: 1 }), '23505', unique);
      await insertBudget({ currency: 'EUR' });
      await insertBudget({ period: 'weekly', startDate: '2026-10-05' });
      await insertBudget({ scope: 'category', categoryId: groceries });
      await rejects(insertBudget({ scope: 'category', categoryId: groceries }), '23505', unique);
      await insertBudget({ scope: 'category', categoryId: await systemCategory('expense.dining') });
      const other = await insertUser('b-other@example.com');
      await insertBudget({ userId: other });

      const index = (await indexesOf('budgets')).find((i) => i.indexname === unique);
      expect(index?.indexdef).toContain('NULLS NOT DISTINCT');
    });

    it('keeps category references inside the owner and restricts deleting referenced rows', async () => {
      const other = await insertUser('b-other2@example.com');
      const theirs = await insertCategory(other, 'Theirs');
      await rejects(
        insertBudget({ scope: 'category', categoryId: theirs }),
        '23503',
        'fk_category_accessible',
      );
      const mine = await insertCategory(userId, 'Mine');
      const id = await insertBudget({ scope: 'category', categoryId: mine });
      await rejects(
        db.updateTable('budgets').set({ categoryId: theirs }).where('id', '=', id).execute(),
        '23503',
        'fk_category_accessible',
      );
      await rejects(
        db.deleteFrom('categories').where('id', '=', mine).execute(),
        '23503',
        'fk_budgets__category',
      );
      // The user also owns a category, so either restricting key may report first.
      await rejects(db.deleteFrom('users').where('id', '=', userId).execute(), '23503');
      // AP-12: the category delete path removes the budgets first, then the category.
      await db.deleteFrom('budgets').where('categoryId', '=', mine).execute();
      await db.deleteFrom('categories').where('id', '=', mine).execute();
    });

    it('maintains updated_at and has the planned indexes', async () => {
      const id = await insertBudget({});
      const before = await db
        .selectFrom('budgets')
        .select('updatedAt')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      await pool.query('SELECT pg_sleep(0.01)');
      await db.updateTable('budgets').set({ amountMinor: 60_000 }).where('id', '=', id).execute();
      const after = await db
        .selectFrom('budgets')
        .select('updatedAt')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      await rejects(
        db.deleteFrom('users').where('id', '=', userId).execute(),
        '23503',
        'fk_budgets__user',
      );
      expect((await indexesOf('budgets')).map((i) => i.indexname)).toEqual([
        'ix_budgets__category_id',
        'pk_budgets',
        'uq_budgets__user_category_period_currency',
      ]);
    });
  });

  describe('recurring templates and runs (E8-F1-S1)', () => {
    let userId: string;
    let wallet: string;
    let groceries: string;
    let salary: string;

    beforeEach(async () => {
      userId = await insertUser('r@example.com');
      wallet = await insertWallet(userId, 'Checking');
      groceries = await systemCategory('expense.groceries');
      salary = await systemCategory('income.salary');
    });

    const insertTemplate = (values: Record<string, unknown> = {}) =>
      db
        .insertInto('recurringTemplates')
        .values({
          userId,
          name: 'Rent',
          type: 'expense',
          walletId: wallet,
          categoryId: groceries,
          amountMinor: 120_000,
          frequency: 'monthly',
          startDate: '2026-10-01',
          nextRunOn: '2026-10-01',
          ...values,
        } as never)
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((r) => r.id);

    const insertRun = (templateId: string, values: Record<string, unknown> = {}) =>
      db
        .insertInto('recurringRuns')
        .values({
          templateId,
          occurrenceDate: '2026-10-01',
          status: 'succeeded',
          ...values,
        } as never)
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((r) => r.id);

    const insertGenerated = (templateId: string | null, values: Record<string, unknown> = {}) =>
      db
        .insertInto('transactions')
        .values({
          userId,
          walletId: wallet,
          type: 'expense',
          categoryId: groceries,
          amountMinor: 120_000,
          currency: 'USD',
          occurredOn: '2026-10-01',
          recurringTemplateId: templateId,
          ...values,
        } as never)
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((r) => r.id);

    it('holds frequency, interval, next run, end date and status, with defaults', async () => {
      for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
        await insertTemplate({ name: frequency, frequency });
      }
      const id = await insertTemplate({ name: 'Ending', endDate: '2027-09-30', intervalCount: 3 });
      const row = await db
        .selectFrom('recurringTemplates')
        .select([
          'status',
          'intervalCount',
          'consecutiveFailures',
          'nextRunOn',
          'endDate',
          'lastRunAt',
          'lastError',
        ])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({
        status: 'active',
        intervalCount: 3,
        consecutiveFailures: 0,
        nextRunOn: '2026-10-01',
        endDate: '2027-09-30',
        lastRunAt: null,
        lastError: null,
      });
      const defaults = await db
        .selectFrom('recurringTemplates')
        .select('intervalCount')
        .where('name', '=', 'daily')
        .executeTakeFirstOrThrow();
      expect(defaults.intervalCount).toBe(1);
    });

    it('rejects bad types, frequencies, intervals, statuses, amounts, names, notes and errors', async () => {
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ type: 'transfer' }, 'ck_recurring_templates__type'],
        [{ frequency: 'hourly' }, 'ck_recurring_templates__frequency'],
        [{ intervalCount: 0 }, 'ck_recurring_templates__interval'],
        [{ intervalCount: 100 }, 'ck_recurring_templates__interval'],
        [{ status: 'stopped' }, 'ck_recurring_templates__status'],
        [{ amountMinor: 0 }, 'ck_recurring_templates__amount_range'],
        [{ amountMinor: MAX + 1 }, 'ck_recurring_templates__amount_range'],
        [{ name: ' Rent' }, 'ck_recurring_templates__name'],
        [{ name: 'x'.repeat(61) }, 'ck_recurring_templates__name'],
        [{ note: '' }, 'ck_recurring_templates__note'],
        [{ note: 'x'.repeat(501) }, 'ck_recurring_templates__note'],
        [{ lastError: 'oops' }, 'ck_recurring_templates__last_error'],
        [{ consecutiveFailures: -1 }, 'ck_recurring_templates__failures'],
      ];
      for (const [values, constraint] of cases) {
        await rejects(insertTemplate(values), '23514', constraint);
      }
      await insertTemplate({
        intervalCount: 99,
        note: 'x'.repeat(500),
        lastError: 'WALLET_ARCHIVED',
      });
    });

    it('checks the date window and ties next_run_on to the ended status', async () => {
      const dates = 'ck_recurring_templates__dates';
      await rejects(insertTemplate({ endDate: '2026-09-30' }), '23514', dates);
      await rejects(insertTemplate({ startDate: '1899-12-31' }), '23514', dates);
      await rejects(insertTemplate({ endDate: '2101-01-01' }), '23514', dates);
      await insertTemplate({ name: 'One-off', endDate: '2026-10-01' });

      const nextRun = 'ck_recurring_templates__next_run';
      await rejects(insertTemplate({ status: 'ended' }), '23514', nextRun);
      await rejects(insertTemplate({ nextRunOn: null }), '23514', nextRun);
      await rejects(insertTemplate({ status: 'paused', nextRunOn: null }), '23514', nextRun);
      await insertTemplate({ name: 'Done', status: 'ended', nextRunOn: null });
      await insertTemplate({ name: 'Paused', status: 'paused' });
    });

    it('keeps wallet and category references inside the owner and matches the category type', async () => {
      const other = await insertUser('r-other@example.com');
      const theirWallet = await insertWallet(other, 'Theirs');
      const theirCategory = await insertCategory(other, 'Theirs');
      await rejects(
        insertTemplate({ walletId: theirWallet }),
        '23503',
        'fk_recurring_templates__wallet',
      );
      await rejects(
        insertTemplate({ categoryId: theirCategory }),
        '23503',
        'fk_category_accessible',
      );
      await rejects(
        insertTemplate({ type: 'income', categoryId: groceries }),
        '23503',
        'fk_recurring_templates__category',
      );
      await insertTemplate({ name: 'Salary', type: 'income', categoryId: salary });
    });

    it('restricts deleting a wallet, category or user that a template uses', async () => {
      const mine = await insertCategory(userId, 'Mine');
      await insertTemplate({ categoryId: mine });
      await rejects(
        db.deleteFrom('wallets').where('id', '=', wallet).execute(),
        '23503',
        'fk_recurring_templates__wallet',
      );
      await rejects(
        db.deleteFrom('categories').where('id', '=', mine).execute(),
        '23503',
        'fk_recurring_templates__category',
      );
      await rejects(db.deleteFrom('users').where('id', '=', userId).execute(), '23503');
    });

    it('records one run per template and occurrence date; only a failed run can be retried (AP-11)', async () => {
      const template = await insertTemplate();
      await insertRun(template, { status: 'failed', errorCode: 'WALLET_ARCHIVED' });
      await rejects(insertRun(template), '23505', 'uq_recurring_runs__template_occurrence');

      // The scheduler upsert: overwrite only a failed run, and count the attempts.
      const upsert = (status: string, transactionId: string | null, errorCode: string | null) =>
        sql<{ id: string; attempts: number }>`
          INSERT INTO recurring_runs (template_id, occurrence_date, status, transaction_id, error_code)
          VALUES (${template}, ${'2026-10-01'}, ${status}, ${transactionId}, ${errorCode})
          ON CONFLICT (template_id, occurrence_date) DO UPDATE
             SET status = EXCLUDED.status, transaction_id = EXCLUDED.transaction_id,
                 error_code = EXCLUDED.error_code, attempts = recurring_runs.attempts + 1
           WHERE recurring_runs.status = 'failed'
          RETURNING id, attempts`.execute(db);
      const txn = await insertGenerated(template);
      const retried = await upsert('succeeded', txn, null);
      expect(retried.rows).toEqual([{ id: expect.any(String), attempts: 2 }]);
      const again = await upsert('succeeded', txn, null);
      expect(again.rows).toEqual([]);

      await insertRun(template, {
        occurrenceDate: '2026-11-01',
        status: 'skipped',
        errorCode: 'X',
      });
      const runs = await db
        .selectFrom('recurringRuns')
        .select(['occurrenceDate', 'status', 'attempts'])
        .orderBy('occurrenceDate', 'desc')
        .execute();
      expect(runs).toEqual([
        { occurrenceDate: '2026-11-01', status: 'skipped', attempts: 1 },
        { occurrenceDate: '2026-10-01', status: 'succeeded', attempts: 2 },
      ]);
    });

    it('checks the run shape: status, error code, transaction and attempts', async () => {
      const template = await insertTemplate();
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ status: 'pending', errorCode: 'SOME_ERROR' }, 'ck_recurring_runs__status'],
        [{ status: 'succeeded', errorCode: 'SOME_ERROR' }, 'ck_recurring_runs__error_shape'],
        [{ status: 'failed' }, 'ck_recurring_runs__error_shape'],
        [{ status: 'failed', errorCode: 'bad code' }, 'ck_recurring_runs__error_code'],
        [{ attempts: 0 }, 'ck_recurring_runs__attempts'],
      ];
      for (const [values, constraint] of cases) {
        await rejects(insertRun(template, values), '23514', constraint);
      }
      const txn = await insertGenerated(template);
      await rejects(
        insertRun(template, { status: 'failed', errorCode: 'SOME_ERROR', transactionId: txn }),
        '23514',
        'ck_recurring_runs__transaction_shape',
      );
      await insertRun(template, { transactionId: txn });
      await rejects(
        insertRun(template, { occurrenceDate: '2026-11-01', transactionId: txn }),
        '23505',
        'uq_recurring_runs__transaction',
      );
    });

    it('links generated transactions to a template of the same user, never to a transfer', async () => {
      const template = await insertTemplate();
      const other = await insertUser('r-other3@example.com');
      const otherWallet = await insertWallet(other, 'Theirs');
      const theirTemplate = await db
        .insertInto('recurringTemplates')
        .values({
          userId: other,
          name: 'Theirs',
          type: 'expense',
          walletId: otherWallet,
          categoryId: groceries,
          amountMinor: 100,
          frequency: 'weekly',
          startDate: '2026-10-05',
          nextRunOn: '2026-10-05',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await rejects(
        insertGenerated(theirTemplate.id),
        '23503',
        'fk_transactions__recurring_template',
      );
      await insertGenerated(template);
      const wallet2 = await insertWallet(userId, 'Savings');
      await rejects(
        db.transaction().execute(async (trx) => {
          const header = await trx
            .insertInto('transfers')
            .values({ userId })
            .returning('id')
            .executeTakeFirstOrThrow();
          for (const [walletId, transferDirection] of [
            [wallet, 'out'],
            [wallet2, 'in'],
          ] as const) {
            await trx
              .insertInto('transactions')
              .values({
                userId,
                walletId,
                type: 'transfer',
                categoryId: null,
                amountMinor: 100,
                currency: 'USD',
                occurredOn: '2026-10-01',
                transferId: header.id,
                transferDirection,
                recurringTemplateId: template,
              })
              .execute();
          }
        }),
        '23514',
        'ck_transactions__recurring_type',
      );
    });

    it('deleting a template keeps its transactions (link cleared) and removes its runs (C-09)', async () => {
      const template = await insertTemplate();
      const first = await insertGenerated(template);
      const second = await insertGenerated(template, { occurredOn: '2026-11-01' });
      await insertRun(template, { transactionId: first });
      await insertRun(template, { occurrenceDate: '2026-11-01', transactionId: second });

      // Deleting a generated transaction keeps its run, so the occurrence is not regenerated.
      await db.deleteFrom('transactions').where('id', '=', second).execute();
      const kept = await db
        .selectFrom('recurringRuns')
        .select(['occurrenceDate', 'transactionId'])
        .orderBy('occurrenceDate')
        .execute();
      expect(kept).toEqual([
        { occurrenceDate: '2026-10-01', transactionId: first },
        { occurrenceDate: '2026-11-01', transactionId: null },
      ]);

      const balance = async () =>
        (
          await db
            .selectFrom('wallets')
            .select('ledgerBalanceMinor')
            .where('id', '=', wallet)
            .executeTakeFirstOrThrow()
        ).ledgerBalanceMinor;
      expect(await balance()).toBe(-120_000);

      await db.deleteFrom('recurringTemplates').where('id', '=', template).execute();
      const txn = await db
        .selectFrom('transactions')
        .select(['id', 'userId', 'recurringTemplateId'])
        .execute();
      expect(txn).toEqual([{ id: first, userId, recurringTemplateId: null }]);
      expect(await db.selectFrom('recurringRuns').select('id').execute()).toEqual([]);
      expect(await balance()).toBe(-120_000);
    });

    it('serves the due-template claim from ix_recurring_templates__due, with SKIP LOCKED claims', async () => {
      // 600 templates over three statuses and a year of next-run dates, so the planner has stats.
      await sql`
        INSERT INTO recurring_templates
          (user_id, name, type, wallet_id, category_id, amount_minor, frequency, start_date,
           next_run_on, status)
        SELECT ${userId}, 'T' || g, 'expense', ${wallet}, ${groceries}, 100, 'monthly',
               DATE '2026-01-01',
               CASE WHEN g % 3 = 2 THEN NULL ELSE DATE '2026-01-01' + (g % 365) END,
               CASE g % 3 WHEN 0 THEN 'active' WHEN 1 THEN 'paused' ELSE 'ended' END
          FROM generate_series(1, 600) AS g`.execute(db);
      await sql`ANALYZE recurring_templates`.execute(db);

      const claim = (limit: number) => sql`
        SELECT id FROM recurring_templates
         WHERE status = 'active' AND next_run_on <= ${'2026-03-01'}
         ORDER BY next_run_on, id LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
      expect(await plan(claim(100))).toContain('ix_recurring_templates__due');

      // Two runners claiming concurrently never get the same template (C-03).
      const clients = [
        new pg.Client(dbTestInfo()!.ownerUrl),
        new pg.Client(dbTestInfo()!.ownerUrl),
      ];
      try {
        await Promise.all(clients.map((c) => c.connect()));
        const text = `SELECT id FROM recurring_templates
                       WHERE status = 'active' AND next_run_on <= $1
                       ORDER BY next_run_on, id LIMIT 5 FOR UPDATE SKIP LOCKED`;
        await clients[0]!.query('BEGIN');
        const a = await clients[0]!.query<{ id: string }>(text, ['2026-03-01']);
        await clients[1]!.query('BEGIN');
        const b = await clients[1]!.query<{ id: string }>(text, ['2026-03-01']);
        expect(a.rows).toHaveLength(5);
        expect(b.rows).toHaveLength(5);
        const overlap = a.rows.filter((r) => b.rows.some((s) => s.id === r.id));
        expect(overlap).toEqual([]);
        await Promise.all(clients.map((c) => c.query('ROLLBACK')));
      } finally {
        await Promise.all(clients.map((c) => c.end()));
      }

      expect((await indexesOf('recurring_templates')).map((i) => i.indexname)).toEqual([
        'ix_recurring_templates__category_id',
        'ix_recurring_templates__due',
        'ix_recurring_templates__user_id',
        'ix_recurring_templates__wallet_id',
        'pk_recurring_templates',
        'uq_recurring_templates__id_user',
      ]);
      expect((await indexesOf('recurring_runs')).map((i) => i.indexname)).toEqual([
        'pk_recurring_runs',
        'uq_recurring_runs__template_occurrence',
        'uq_recurring_runs__transaction',
      ]);
    });
  });

  describe('audit log and role fields (E9-F1-S1)', () => {
    const insertAudit = (values: Record<string, unknown> = {}) =>
      db
        .insertInto('auditLogs')
        .values({ action: 'auth.logout', targetType: 'user', ...values } as never)
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((r) => r.id);

    it('stores actor, action, target, timestamp, request context and metadata', async () => {
      const actor = await insertUser('a@example.com');
      const target = await insertUser('a-target@example.com');
      const occurredAt = new Date('2026-10-18T09:30:00.123Z');
      const id = await insertAudit({
        occurredAt,
        actorUserId: actor,
        action: 'admin.user_suspended',
        targetType: 'user',
        targetId: target,
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (test)',
        requestId: 'req-0123456789',
        metadata: { reason: 'spam', previousStatus: 'active' },
      });
      const row = await db
        .selectFrom('auditLogs')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({
        id,
        occurredAt,
        actorUserId: actor,
        action: 'admin.user_suspended',
        targetType: 'user',
        targetId: target,
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (test)',
        requestId: 'req-0123456789',
        metadata: { reason: 'spam', previousStatus: 'active' },
      });

      // Defaults: occurred_at now, an empty metadata object, no actor (system or anonymous).
      const minimal = await insertAudit({
        action: 'system.admin_bootstrapped',
        targetType: 'system',
      });
      const defaults = await db
        .selectFrom('auditLogs')
        .select(['occurredAt', 'actorUserId', 'targetId', 'metadata'])
        .where('id', '=', minimal)
        .executeTakeFirstOrThrow();
      expect(defaults).toMatchObject({ actorUserId: null, targetId: null, metadata: {} });
      expect(defaults.occurredAt).toBeInstanceOf(Date);
    });

    it('accepts every shared AuditAction and AuditTargetType, and checks the formats', async () => {
      for (const action of AUDIT_ACTIONS) await insertAudit({ action });
      for (const targetType of AUDIT_TARGET_TYPES) await insertAudit({ targetType });

      const cases: Array<[Record<string, unknown>, string]> = [
        [{ action: 'Admin.Thing' }, 'ck_audit_logs__action'],
        [{ action: 'nodot' }, 'ck_audit_logs__action'],
        [{ action: 'auth.login-failed' }, 'ck_audit_logs__action'],
        [{ action: 'a.' + 'b'.repeat(63) }, 'ck_audit_logs__action'],
        [{ targetType: 'wallet' }, 'ck_audit_logs__target_type'],
        [{ userAgent: 'x'.repeat(513) }, 'ck_audit_logs__user_agent'],
        [{ requestId: 'short' }, 'ck_audit_logs__request_id'],
        [{ requestId: 'has space here' }, 'ck_audit_logs__request_id'],
        [{ metadata: JSON.stringify([1, 2]) }, 'ck_audit_logs__metadata'],
        [{ metadata: { blob: 'x'.repeat(4100) } }, 'ck_audit_logs__metadata'],
      ];
      for (const [values, constraint] of cases) {
        await rejects(insertAudit(values), '23514', constraint);
      }
    });

    it('has no foreign keys: rows outlive and may predate what they reference', async () => {
      const ghost = '00000000-0000-7000-8000-000000000001';
      await insertAudit({ actorUserId: ghost, targetType: 'session', targetId: ghost });
      const fks = await pool.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'audit_logs'::regclass AND contype = 'f'`,
      );
      expect(fks.rows).toEqual([]);
    });

    describe('immutability (C-10)', () => {
      let app: pg.Pool;
      const clients: pg.Client[] = [];
      beforeAll(() => {
        app = new pg.Pool({ connectionString: dbTestInfo()!.appUrl, max: 2 });
      });
      afterAll(async () => {
        await app.end();
      });
      afterEach(async () => {
        await Promise.all(clients.splice(0).map((c) => c.end()));
      });
      const ownerClient = async () => {
        const client = new pg.Client(dbTestInfo()!.ownerUrl);
        await client.connect();
        clients.push(client);
        return client;
      };
      const appendOnly = { code: '42501', message: 'audit_logs is append-only' };

      it('lets midas_app insert and read audit rows but never update, delete or truncate them', async () => {
        await app.query(
          `INSERT INTO audit_logs (action, target_type) VALUES ('auth.login_failed', 'user')`,
        );
        const read = await app.query(`SELECT action FROM audit_logs`);
        expect(read.rows).toEqual([{ action: 'auth.login_failed' }]);
        for (const statement of [
          `UPDATE audit_logs SET action = 'auth.logout'`,
          `DELETE FROM audit_logs`,
          `TRUNCATE audit_logs`,
        ]) {
          await expect(app.query(statement)).rejects.toMatchObject({ code: '42501' });
        }
        expect((await pool.query(`SELECT count(*)::int AS n FROM audit_logs`)).rows[0].n).toBe(1);
      });

      it('rejects updates for every role, the owner included, through the trigger', async () => {
        const id = await insertAudit();
        await expect(
          pool.query(`UPDATE audit_logs SET action = 'auth.registered' WHERE id = $1`, [id]),
        ).rejects.toMatchObject(appendOnly);
        const triggers = await pool.query(
          `SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal`,
        );
        expect(triggers.rows).toEqual([{ tgname: 'tg_audit_logs__immutable' }]);
      });

      it('rejects deletes by a role that holds DELETE but is not in midas_maintenance', async () => {
        await insertAudit();
        const role = 'midas_test_tamper_' + randomBytes(4).toString('hex');
        const client = await ownerClient();
        await client.query('BEGIN');
        try {
          // Roles are transactional: this one disappears with the rollback.
          await client.query(`CREATE ROLE ${role} NOLOGIN`);
          await client.query(`GRANT SELECT, UPDATE, DELETE ON audit_logs TO ${role}`);
          await client.query(`SET LOCAL ROLE ${role}`);
          await expect(client.query(`DELETE FROM audit_logs`)).rejects.toMatchObject(appendOnly);
        } finally {
          await client.query('ROLLBACK');
        }
      });

      it('lets a midas_maintenance member purge old rows (retention) but still not update them', async () => {
        // Far older than the 400-day window whatever the server clock says.
        const old = await insertAudit({ occurredAt: new Date('2000-01-01T00:00:00Z') });
        const recent = await insertAudit();
        const role = 'midas_test_purger_' + randomBytes(4).toString('hex');
        const client = await ownerClient();
        await client.query('BEGIN');
        try {
          await client.query(`CREATE ROLE ${role} NOLOGIN IN ROLE midas_maintenance`);
          await client.query(`SET LOCAL ROLE ${role}`);
          await client.query('SAVEPOINT before_update');
          await expect(
            client.query(`UPDATE audit_logs SET action = 'auth.logout'`),
          ).rejects.toMatchObject({ code: '42501' });
          await client.query('ROLLBACK TO SAVEPOINT before_update');
          const purged = await client.query<{ id: string }>(
            `DELETE FROM audit_logs WHERE occurred_at < now() - interval '400 days' RETURNING id`,
          );
          expect(purged.rows).toEqual([{ id: old }]);
          const left = await client.query<{ id: string }>(`SELECT id FROM audit_logs`);
          expect(left.rows).toEqual([{ id: recent }]);
        } finally {
          await client.query('ROLLBACK');
        }
      });
    });

    it('has indexes that serve the actor, target, action and date filters with keyset order (AP-14)', async () => {
      const actor = await insertUser('a-idx@example.com');
      const target = '00000000-0000-7000-8000-0000000000aa';
      // Realistic shape: auth events dominate and admin actions are rare (2%), which is when an
      // action filter is selective enough for its own index. For a very common action, a backward
      // scan of ix_audit_logs__occurred_at with a filter is the cheaper plan, and that is fine.
      await sql`
        INSERT INTO audit_logs (occurred_at, actor_user_id, action, target_type, target_id)
        SELECT timestamptz '2026-01-01' + g * interval '1 hour',
               CASE WHEN g % 4 = 0 THEN ${actor}::uuid END,
               CASE WHEN g % 50 = 0 THEN 'admin.user_suspended'
                    ELSE (ARRAY['auth.login_succeeded', 'auth.logout'])[1 + g % 2] END,
               (ARRAY['user', 'session', 'category', 'system'])[1 + g % 4],
               CASE WHEN g % 5 = 0 THEN ${target}::uuid ELSE gen_random_uuid() END
          FROM generate_series(1, 2000) AS g`.execute(db);
      await sql`ANALYZE audit_logs`.execute(db);

      const keyset = sql`ORDER BY occurred_at DESC, id DESC LIMIT 50`;
      expect(
        await plan(sql`SELECT id FROM audit_logs WHERE actor_user_id = ${actor} ${keyset}`),
      ).toContain('ix_audit_logs__actor_occurred_at');
      expect(
        await plan(
          sql`SELECT id FROM audit_logs WHERE target_type = 'user' AND target_id = ${target} ${keyset}`,
        ),
      ).toContain('ix_audit_logs__target_occurred_at');
      expect(
        await plan(sql`SELECT id FROM audit_logs WHERE action = 'admin.user_suspended' ${keyset}`),
      ).toContain('ix_audit_logs__action_occurred_at');
      expect(
        await plan(sql`
          SELECT id FROM audit_logs
           WHERE (occurred_at, id) < (${new Date('2026-02-01T00:00:00Z')}, ${'ffffffff-ffff-ffff-ffff-ffffffffffff'}::uuid)
             AND occurred_at >= ${new Date('2026-01-15T00:00:00Z')} ${keyset}`),
      ).toContain('ix_audit_logs__occurred_at');

      expect((await indexesOf('audit_logs')).map((i) => i.indexname)).toEqual([
        'ix_audit_logs__action_occurred_at',
        'ix_audit_logs__actor_occurred_at',
        'ix_audit_logs__occurred_at',
        'ix_audit_logs__target_occurred_at',
        'pk_audit_logs',
      ]);
    });

    it('keeps the role and status fields on users, with the active-admin index (C-06)', async () => {
      const admin = await insertUser('admin@example.com', { role: 'admin' });
      await insertUser('plain@example.com');
      // Suspension sets status, suspended_at and reason together; reactivation clears all three.
      await db
        .updateTable('users')
        .set({ status: 'suspended', suspendedAt: new Date(), suspendedReason: 'Abuse report' })
        .where('id', '=', admin)
        .execute();
      await rejects(
        db.updateTable('users').set({ status: 'active' }).where('id', '=', admin).execute(),
        '23514',
        'ck_users__suspension',
      );
      await db
        .updateTable('users')
        .set({ status: 'active', suspendedAt: null, suspendedReason: null })
        .where('id', '=', admin)
        .execute();

      const index = (await indexesOf('users')).find(
        (i) => i.indexname === 'ix_users__active_admins',
      );
      expect(index?.indexdef).toContain(
        `WHERE ((role = 'admin'::text) AND (status = 'active'::text))`,
      );
      expect(
        await plan(sql`SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active'`),
      ).toContain('ix_users__active_admins');
    });
  });
});
