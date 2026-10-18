import {
  REPORT_MAX_RANGE_DAYS,
  SUMMARY_RECENT_LIMIT,
  TREND_MAX_BUCKETS,
  addDays,
  allocatePercentages,
  dateInTimeZone,
  inclusiveDays,
  nextPeriodStart,
  periodEnd,
  periodStart,
  type CategoryBreakdownQuery,
  type CurrencyCode,
  type CurrencyTotals,
  type ReportCategoryBreakdown,
  type ReportSummary,
  type ReportTrend,
  type SummaryQuery,
  type TrendBucket,
  type TrendGroupBy,
  type TrendQuery,
} from '@midas/shared';
import type { Kysely } from 'kysely';
import type { Clock } from '../../platform/clock.js';
import type { Database } from '../../platform/db/database.js';
import { AppError } from '../../platform/errors.js';
import { createBudgetsRepository } from '../budgets/repository.js';
import { isActiveFor, withStatus } from '../budgets/status.js';
import { listTransactionRows } from '../transactions/list-query.js';
import { toTransactionDto } from '../transactions/dto.js';
import { createWalletsRepository } from '../wallets/repository.js';
import { toWalletDto } from '../wallets/service.js';
import { createReportsRepository, type BreakdownRow } from './repository.js';

export interface ReportPrincipal {
  userId: string;
  preferences: { currency: string; timezone: string };
}

const rangeTooLarge = (detail: string) => new AppError('RANGE_TOO_LARGE', detail);

/**
 * Reports are computed on read from the ledger (ADR-009). Income and expense totals exclude
 * transfers, and every figure is per currency: nothing is ever summed across currencies (ADR-008).
 * The default range is the current calendar month in the user's time zone (ADR-017); a missing
 * bound takes that month's bound, and an inverted result is a validation error.
 */
export class ReportService {
  constructor(private readonly deps: { db: Kysely<Database>; clock: Clock }) {}

  private resolveRange(principal: ReportPrincipal, query: { from?: string; to?: string }) {
    const today = dateInTimeZone(this.deps.clock.now(), principal.preferences.timezone);
    const from = query.from ?? periodStart('monthly', today);
    const to = query.to ?? periodEnd('monthly', today);
    if (to < from) {
      throw new AppError('VALIDATION_FAILED', 'The request is invalid.', {
        errors: [
          {
            field: query.to === undefined ? 'from' : 'to',
            code: 'INVALID_RANGE',
            message: 'The end of the range must not be before its start.',
          },
        ],
      });
    }
    return { from, to };
  }

  async summary(principal: ReportPrincipal, query: SummaryQuery): Promise<ReportSummary> {
    const { from, to } = this.resolveRange(principal, query);
    if (inclusiveDays(from, to) > REPORT_MAX_RANGE_DAYS) {
      throw rangeTooLarge(`The range may span at most ${REPORT_MAX_RANGE_DAYS} days.`);
    }
    const { db } = this.deps;
    const userId = principal.userId;
    const [wallets, totals, recent, budgetRows] = await Promise.all([
      createWalletsRepository(db).list(userId, false),
      createReportsRepository(db).totalsByCurrency(userId, from, to),
      listTransactionRows(db, userId, {
        from,
        to,
        sort: 'date_desc',
        limit: SUMMARY_RECENT_LIMIT,
      }),
      createBudgetsRepository(db).list(userId),
    ]);

    // Balances are summed per currency in BigInt: 100 wallets of up to 10^14 exceed 2^53 in total.
    const balances = new Map<string, bigint>();
    for (const wallet of wallets) {
      balances.set(
        wallet.currency,
        (balances.get(wallet.currency) ?? 0n) + BigInt(wallet.balanceMinor),
      );
    }
    const byCurrency = new Map<string, CurrencyTotals>();
    const ensure = (currency: string): CurrencyTotals => {
      let entry = byCurrency.get(currency);
      if (!entry) {
        entry = {
          currency: currency as CurrencyCode,
          balanceMinor: 0,
          incomeMinor: 0,
          expenseMinor: 0,
          netMinor: 0,
        };
        byCurrency.set(currency, entry);
      }
      return entry;
    };
    for (const [currency, balance] of balances) ensure(currency).balanceMinor = Number(balance);
    for (const row of totals) {
      const entry = ensure(row.currency);
      entry.incomeMinor = row.incomeMinor;
      entry.expenseMinor = row.expenseMinor;
      entry.netMinor = row.incomeMinor - row.expenseMinor;
    }

    const activeBudgets = budgetRows.filter((row) => isActiveFor(row, to));
    return {
      from,
      to,
      wallets: wallets.map(toWalletDto),
      totalsByCurrency: [...byCurrency.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1)),
      recentTransactions: recent.rows.map(toTransactionDto),
      budgets: await withStatus(db, userId, activeBudgets, to),
    };
  }

  async trend(principal: ReportPrincipal, query: TrendQuery): Promise<ReportTrend> {
    const { from, to } = this.resolveRange(principal, query);
    const currency = (query.currency ?? principal.preferences.currency) as CurrencyCode;
    const days = inclusiveDays(from, to);
    const groupBy: TrendGroupBy =
      query.groupBy ?? (days <= 31 ? 'day' : days <= 182 ? 'week' : 'month');

    const shells = bucketShells(groupBy, from, to);
    const rows = await createReportsRepository(this.deps.db).trend(
      principal.userId,
      currency,
      from,
      to,
      groupBy,
    );
    const byStart = new Map(rows.map((row) => [row.bucketStart, row]));
    const buckets: TrendBucket[] = shells.map((shell) => {
      const row = byStart.get(shell.key);
      const incomeMinor = row?.incomeMinor ?? 0;
      const expenseMinor = row?.expenseMinor ?? 0;
      return {
        periodStart: shell.periodStart,
        periodEnd: shell.periodEnd,
        incomeMinor,
        expenseMinor,
        netMinor: incomeMinor - expenseMinor,
      };
    });
    return { from, to, groupBy, currency, buckets };
  }

  async categoryBreakdown(
    principal: ReportPrincipal,
    query: CategoryBreakdownQuery,
  ): Promise<ReportCategoryBreakdown> {
    const { from, to } = this.resolveRange(principal, query);
    if (inclusiveDays(from, to) > REPORT_MAX_RANGE_DAYS) {
      throw rangeTooLarge(`The range may span at most ${REPORT_MAX_RANGE_DAYS} days.`);
    }
    const currency = (query.currency ?? principal.preferences.currency) as CurrencyCode;
    const rows: BreakdownRow[] = await createReportsRepository(this.deps.db).categoryBreakdown(
      principal.userId,
      query.type,
      currency,
      from,
      to,
    );
    rows.sort((a, b) =>
      a.amountMinor !== b.amountMinor
        ? b.amountMinor - a.amountMinor
        : a.name.localeCompare(b.name) || (a.categoryId < b.categoryId ? -1 : 1),
    );

    const top = rows.slice(0, query.top);
    const rest = rows.slice(query.top);
    const restAmount = rest.reduce((sum, row) => sum + row.amountMinor, 0);
    const totalMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
    const percentages = allocatePercentages([
      ...top.map((row) => row.amountMinor),
      ...(rest.length > 0 ? [restAmount] : []),
    ]);
    return {
      from,
      to,
      type: query.type,
      currency,
      totalMinor,
      items: top.map((row, index) => ({
        category: {
          id: row.categoryId,
          name: row.name,
          type: row.type,
          icon: row.icon,
          color: row.color,
          system: row.ownerUserId === null,
          retired: row.retiredAt !== null,
        },
        amountMinor: row.amountMinor,
        percentage: percentages[index] ?? 0,
        transactionCount: row.transactionCount,
      })),
      other:
        rest.length > 0
          ? {
              amountMinor: restAmount,
              percentage: percentages[top.length] ?? 0,
              categoryCount: rest.length,
            }
          : null,
    };
  }
}

interface BucketShell {
  /** The date_trunc value the database groups by. */
  key: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * Every bucket of the range, empty ones included. Weeks start on Monday. The first and last
 * bucket are clamped to the requested range, because only that range is counted in them.
 * Throws RANGE_TOO_LARGE as soon as the 401st bucket would be needed.
 */
export function bucketShells(groupBy: TrendGroupBy, from: string, to: string): BucketShell[] {
  const unit = groupBy === 'day' ? null : groupBy === 'week' ? 'weekly' : 'monthly';
  const shells: BucketShell[] = [];
  let key = unit === null ? from : periodStart(unit, from);
  while (key <= to) {
    if (shells.length >= TREND_MAX_BUCKETS) {
      throw rangeTooLarge(`A trend may contain at most ${TREND_MAX_BUCKETS} buckets.`);
    }
    const end = unit === null ? key : periodEnd(unit, key);
    shells.push({
      key,
      periodStart: key < from ? from : key,
      periodEnd: end > to ? to : end,
    });
    key = unit === null ? addDays(key, 1) : nextPeriodStart(unit, key);
  }
  return shells;
}
