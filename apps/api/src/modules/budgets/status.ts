import {
  budgetState,
  percentUsed,
  periodEnd,
  periodStart,
  type Budget,
  type BudgetPeriod,
  type BudgetStatus,
  type CurrencyCode,
} from '@midas/shared';
import type { DbHandle } from '../../platform/db/client.js';
import { createBudgetsRepository, type BudgetRow, type SpentRow } from './repository.js';

export function toBudgetDto(row: BudgetRow, status: BudgetStatus | null): Budget {
  const category =
    row.categoryId !== null &&
    row.categoryName !== null &&
    row.categoryType !== null &&
    row.categoryIcon !== null &&
    row.categoryColor !== null
      ? {
          id: row.categoryId,
          name: row.categoryName,
          type: row.categoryType,
          icon: row.categoryIcon,
          color: row.categoryColor,
          system: row.categoryOwnerId === null,
          retired: row.categoryRetiredAt !== null,
        }
      : null;
  return {
    id: row.id,
    scope: row.scope,
    category,
    period: row.period,
    amountMinor: row.amountMinor,
    currency: row.currency as CurrencyCode,
    warningThresholdPct: row.warningThresholdPct,
    startDate: row.startDate,
    status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Does the period (of the budget's own kind) that contains `date` reach the budget's start? */
export function isActiveFor(row: Pick<BudgetRow, 'period' | 'startDate'>, date: string): boolean {
  return periodEnd(row.period, date) >= row.startDate;
}

/**
 * Status of one budget in the period containing `date` (ADR-012). Spent is the sum of expense
 * transactions in that period in the budget currency: all of them for an overall budget, only the
 * budget category for a category budget. State and percentage use integer math.
 */
export function statusFor(
  row: BudgetRow,
  date: string,
  spent: readonly SpentRow[],
): BudgetStatus | null {
  const end = periodEnd(row.period, date);
  if (end < row.startDate) return null;
  let spentMinor = 0;
  for (const item of spent) {
    if (item.currency !== row.currency) continue; // never sum across currencies (ADR-008)
    if (row.scope === 'overall' || item.categoryId === row.categoryId) {
      spentMinor += item.spentMinor;
    }
  }
  return {
    periodStart: periodStart(row.period, date),
    periodEnd: end,
    spentMinor,
    remainingMinor: row.amountMinor - spentMinor,
    percentUsed: percentUsed(spentMinor, row.amountMinor),
    state: budgetState(spentMinor, row.amountMinor, row.warningThresholdPct),
  };
}

/**
 * Budgets with their status for the period containing `date`. One grouped query per distinct
 * period kind among the budgets (at most three: week, month and year; database design 8.2).
 */
export async function withStatus(
  db: DbHandle,
  userId: string,
  rows: readonly BudgetRow[],
  date: string,
): Promise<Budget[]> {
  const periods = [...new Set(rows.map((row) => row.period))] as BudgetPeriod[];
  const spentByPeriod = new Map<BudgetPeriod, SpentRow[]>();
  const repository = createBudgetsRepository(db);
  await Promise.all(
    periods.map(async (period) => {
      const spent = await repository.spentByCategory(
        userId,
        periodStart(period, date),
        periodEnd(period, date),
      );
      spentByPeriod.set(period, spent);
    }),
  );
  return rows.map((row) =>
    toBudgetDto(row, statusFor(row, date, spentByPeriod.get(row.period) ?? [])),
  );
}
