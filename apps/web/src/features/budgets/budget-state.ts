import type { Budget, BudgetPeriod, BudgetStatus } from '@midas/shared';
import {
  addDays,
  addYears,
  daysBetween,
  endOfMonth,
  formatLocalDate,
  startOfMonth,
  startOfWeek,
} from '@/lib/dates';
import { formatMinor } from '@/lib/money';

/** The period filter above the list; "all" shows every period and navigates by month. */
export type PeriodFilter = 'all' | BudgetPeriod;
export const PERIOD_FILTERS: readonly PeriodFilter[] = ['all', 'monthly', 'weekly', 'yearly'];

export const PERIOD_FILTER_LABELS: Record<PeriodFilter, string> = {
  all: 'All',
  monthly: 'Monthly',
  weekly: 'Weekly',
  yearly: 'Yearly',
};

export const PERIOD_LABELS: Record<BudgetPeriod, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  yearly: 'Yearly',
};

export function isPeriodFilter(value: unknown): value is PeriodFilter {
  return typeof value === 'string' && (PERIOD_FILTERS as readonly string[]).includes(value);
}

/** One step back or forward: a month for All and Monthly, an ISO week, a year (ui-design 6.7). */
export function shiftBudgetDate(date: string, filter: PeriodFilter, direction: -1 | 1): string {
  if (filter === 'weekly') return addDays(startOfWeek(date), direction * 7);
  if (filter === 'yearly') return addYears(date, direction);
  return startOfMonth(date, direction);
}

/** Heading text of the period navigator. */
export function navigatorLabel(date: string, filter: PeriodFilter, locale: string): string {
  if (filter === 'weekly') {
    const start = formatLocalDate(startOfWeek(date), locale, { day: 'numeric', month: 'short' });
    return `Week of ${start}`;
  }
  if (filter === 'yearly') return formatLocalDate(date, locale, { year: 'numeric' });
  return formatLocalDate(date, locale, { month: 'long', year: 'numeric' });
}

/** True when the viewed date falls in the same period as today for this filter. */
export function isCurrentPeriod(date: string, filter: PeriodFilter, today: string): boolean {
  if (filter === 'weekly') return startOfWeek(date) === startOfWeek(today);
  if (filter === 'yearly') return date.slice(0, 4) === today.slice(0, 4);
  return startOfMonth(date) === startOfMonth(today);
}

/** The period a row covers, for example "Oct 2026", "Week of 12 Oct" or "2026". */
export function rowPeriodLabel(budget: Budget, locale: string): string {
  const start = budget.status?.periodStart ?? budget.startDate;
  if (budget.period === 'weekly') {
    return `Week of ${formatLocalDate(start, locale, { day: 'numeric', month: 'short' })}`;
  }
  if (budget.period === 'yearly') return formatLocalDate(start, locale, { year: 'numeric' });
  return formatLocalDate(start, locale, { month: 'short', year: 'numeric' });
}

export function budgetName(budget: Pick<Budget, 'scope' | 'category'>): string {
  return budget.scope === 'overall' ? 'Overall' : (budget.category?.name ?? 'Category');
}

export interface Pace {
  /** Elapsed share of the period, 0..1. */
  fraction: number;
  daysToGo: number;
}

/** Elapsed time inside the period; null when today is outside it (past or future period). */
export function paceOf(status: BudgetStatus | null, today: string): Pace | null {
  if (!status || today < status.periodStart || today > status.periodEnd) return null;
  const total = daysBetween(status.periodStart, status.periodEnd) + 1;
  const elapsed = daysBetween(status.periodStart, today) + 1;
  return { fraction: elapsed / total, daysToGo: daysBetween(today, status.periodEnd) };
}

/** Whole percent for display. A warning never reads 100% (that would be exceeded). */
export function displayPercent(status: BudgetStatus): number {
  const rounded = Math.round(status.percentUsed);
  return status.state === 'warning' ? Math.min(rounded, 99) : rounded;
}

const STATE_RANK = { exceeded: 0, warning: 1, ok: 2 } as const;

function compareBudgets(a: Budget, b: Budget): number {
  // The overall budget of each currency is pinned first.
  if (a.scope !== b.scope) return a.scope === 'overall' ? -1 : 1;
  if (a.scope === 'overall' && a.currency !== b.currency) {
    return a.currency.localeCompare(b.currency);
  }
  const rank = STATE_RANK[a.status?.state ?? 'ok'] - STATE_RANK[b.status?.state ?? 'ok'];
  if (rank !== 0) return rank;
  const used = (b.status?.percentUsed ?? 0) - (a.status?.percentUsed ?? 0);
  if (used !== 0) return used;
  return budgetName(a).localeCompare(budgetName(b));
}

export interface BudgetGroups {
  attention: Budget[];
  onTrack: Budget[];
}

/** "Needs attention" (exceeded, then near) and "On track"; a budget not started yet is on track. */
export function groupBudgets(budgets: readonly Budget[]): BudgetGroups {
  const attention = budgets.filter((b) => b.status && b.status.state !== 'ok');
  const onTrack = budgets.filter((b) => !b.status || b.status.state === 'ok');
  return { attention: attention.sort(compareBudgets), onTrack: onTrack.sort(compareBudgets) };
}

/** Dashboard order: exceeded and warning first, then by percent used; only started budgets. */
export function topBudgets(budgets: readonly Budget[], count: number): Budget[] {
  return budgets
    .filter((b) => b.status !== null)
    .sort((a, b) => {
      const rank = STATE_RANK[a.status?.state ?? 'ok'] - STATE_RANK[b.status?.state ?? 'ok'];
      return rank !== 0 ? rank : (b.status?.percentUsed ?? 0) - (a.status?.percentUsed ?? 0);
    })
    .slice(0, count);
}

export function needsAttention(budget: Budget): boolean {
  return budget.status !== null && budget.status.state !== 'ok';
}

/** The visible state words, always paired with an icon and the numbers (never color alone). */
export function stateLabel(budget: Budget, locale: string): string {
  const status = budget.status;
  if (!status) {
    return `Starts ${formatLocalDate(budget.startDate, locale, { day: 'numeric', month: 'short' })}`;
  }
  if (status.state === 'exceeded') {
    return status.remainingMinor < 0
      ? `Over by ${formatMinor(-status.remainingMinor, budget.currency, locale)}`
      : 'Limit reached';
  }
  if (status.state === 'warning') return `Near limit, ${displayPercent(status)}% used`;
  return 'On track';
}

/** "Groceries is over its monthly budget by $45.20." for the attention strip. */
export function attentionSentence(budget: Budget, locale: string): string {
  const status = budget.status;
  if (!status) return '';
  const overall = budget.scope === 'overall';
  const who = overall ? `Your overall ${budget.period} budget` : budgetName(budget);
  const noun = overall ? '' : ` its ${budget.period} budget`;
  if (status.state === 'exceeded') {
    const over =
      status.remainingMinor < 0
        ? ` by ${formatMinor(-status.remainingMinor, budget.currency, locale)}`
        : '';
    return overall ? `${who} is exceeded${over}.` : `${who} is over${noun}${over}.`;
  }
  return overall
    ? `${who} is at ${displayPercent(status)}%.`
    : `${who} is at ${displayPercent(status)}% of${noun}.`;
}

/** One polite sentence for a screen reader after data loads (ui-design 6.9). Empty when fine. */
export function attentionAnnouncement(budgets: readonly Budget[]): string {
  const flagged = budgets.filter(needsAttention).sort(compareBudgets);
  if (flagged.length === 0) return '';
  const parts = flagged.map(
    (b) => `${budgetName(b)} is ${b.status?.state === 'exceeded' ? 'over' : 'near'} its limit`,
  );
  const lead = `${flagged.length} budget${flagged.length === 1 ? ' needs' : 's need'} attention`;
  return `${lead}: ${parts.join(', ')}.`;
}

/** First and last day of the period of the given kind that contains `date`. */
export function periodBounds(period: BudgetPeriod, date: string): { start: string; end: string } {
  if (period === 'weekly') {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 6) };
  }
  if (period === 'yearly') {
    const year = date.slice(0, 4);
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return { start: startOfMonth(date), end: endOfMonth(date) };
}
