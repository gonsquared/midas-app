import type { CategoryType, TrendGroupBy } from '@midas/shared';
import { sql } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';

export interface CurrencyTotalsRow {
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
}

export interface TrendRow {
  /** First day of the bucket (date_trunc), not clamped to the requested range. */
  bucketStart: string;
  incomeMinor: number;
  expenseMinor: number;
}

export interface BreakdownRow {
  categoryId: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  ownerUserId: string | null;
  retiredAt: Date | null;
  amountMinor: number;
  transactionCount: number;
}

const incomeSum = sql<number>`coalesce(sum(amount_minor) filter (where type = 'income'), 0)::bigint`;
const expenseSum = sql<number>`coalesce(sum(amount_minor) filter (where type = 'expense'), 0)::bigint`;

/**
 * Report aggregations (database design 8.2, AP-09). Every query is scoped by `user_id`, excludes
 * transfers, never sums across currencies, and casts sums to bigint so an overflow raises
 * instead of wrapping. All of them can be answered by index-only scans of
 * ix_transactions__user_date (the INCLUDE columns carry type, currency, category and amount).
 * The builders are exported so the EXPLAIN tests can inspect the exact statements.
 */
export function totalsQuery(db: DbHandle, userId: string, from: string, to: string) {
  return db
    .selectFrom('transactions')
    .select(['currency', incomeSum.as('incomeMinor'), expenseSum.as('expenseMinor')])
    .where('userId', '=', userId)
    .where('occurredOn', '>=', from)
    .where('occurredOn', '<=', to)
    .where('type', '<>', 'transfer')
    .groupBy('currency')
    .orderBy('currency');
}

/**
 * `unit` comes from the validated enum and is still bound as a parameter. Grouping and ordering
 * use the output position, because two bound copies of one expression would not be recognised as
 * the same expression by PostgreSQL.
 */
export function trendQuery(
  db: DbHandle,
  userId: string,
  currency: string,
  from: string,
  to: string,
  unit: TrendGroupBy,
) {
  return db
    .selectFrom('transactions')
    .select([
      sql<string>`(date_trunc(${unit}::text, occurred_on))::date`.as('bucketStart'),
      incomeSum.as('incomeMinor'),
      expenseSum.as('expenseMinor'),
    ])
    .where('userId', '=', userId)
    .where('currency', '=', currency)
    .where('occurredOn', '>=', from)
    .where('occurredOn', '<=', to)
    .where('type', '<>', 'transfer')
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

export function breakdownQuery(
  db: DbHandle,
  userId: string,
  type: CategoryType,
  currency: string,
  from: string,
  to: string,
) {
  return db
    .selectFrom('transactions as t')
    .innerJoin('categories as c', 'c.id', 't.categoryId')
    .select([
      't.categoryId as categoryId',
      'c.name',
      'c.type',
      'c.icon',
      'c.color',
      'c.ownerUserId',
      'c.retiredAt',
      sql<number>`sum(t.amount_minor)::bigint`.as('amountMinor'),
      sql<number>`count(*)::bigint`.as('transactionCount'),
    ])
    .where('t.userId', '=', userId)
    .where('t.type', '=', type)
    .where('t.currency', '=', currency)
    .where('t.occurredOn', '>=', from)
    .where('t.occurredOn', '<=', to)
    .groupBy([
      't.categoryId',
      'c.name',
      'c.type',
      'c.icon',
      'c.color',
      'c.ownerUserId',
      'c.retiredAt',
    ]);
}

export function createReportsRepository(db: DbHandle) {
  return {
    async totalsByCurrency(userId: string, from: string, to: string): Promise<CurrencyTotalsRow[]> {
      return totalsQuery(db, userId, from, to).execute();
    },

    async trend(
      userId: string,
      currency: string,
      from: string,
      to: string,
      unit: TrendGroupBy,
    ): Promise<TrendRow[]> {
      return trendQuery(db, userId, currency, from, to, unit).execute();
    },

    async categoryBreakdown(
      userId: string,
      type: CategoryType,
      currency: string,
      from: string,
      to: string,
    ): Promise<BreakdownRow[]> {
      return (await breakdownQuery(
        db,
        userId,
        type,
        currency,
        from,
        to,
      ).execute()) as BreakdownRow[];
    },
  };
}

export type ReportsRepository = ReturnType<typeof createReportsRepository>;
