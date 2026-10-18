import type { ReportTrend, TrendBucket, TrendGroupBy } from '@midas/shared';
import { formatLocalDate } from '@/lib/dates';
import { currencyExponent } from '@/lib/money';

/** Above this many buckets, columns become lines (ui-design 8). */
export const MAX_COLUMN_BUCKETS = 36;

const GROUP_WORD: Record<TrendGroupBy, string> = { day: 'day', week: 'week', month: 'month' };

export function groupWord(groupBy: TrendGroupBy): string {
  return GROUP_WORD[groupBy];
}

function crossesYears(trend: Pick<ReportTrend, 'from' | 'to'>): boolean {
  return trend.from.slice(0, 4) !== trend.to.slice(0, 4);
}

/** Short axis label: "16 Oct" for days and weeks, "Oct" (plus the year across years) for months. */
export function axisLabel(
  bucket: TrendBucket,
  trend: Pick<ReportTrend, 'from' | 'to' | 'groupBy'>,
  locale: string,
): string {
  if (trend.groupBy === 'month') {
    return formatLocalDate(bucket.periodStart, locale, {
      month: 'short',
      ...(crossesYears(trend) ? { year: '2-digit' } : {}),
    });
  }
  return formatLocalDate(bucket.periodStart, locale, { day: 'numeric', month: 'short' });
}

/** Full period name for the readout and the table: "Week of 12 Oct", "October 2026". */
export function periodLabel(bucket: TrendBucket, groupBy: TrendGroupBy, locale: string): string {
  if (groupBy === 'month') {
    return formatLocalDate(bucket.periodStart, locale, { month: 'long', year: 'numeric' });
  }
  if (groupBy === 'week') {
    const start = formatLocalDate(bucket.periodStart, locale, { day: 'numeric', month: 'short' });
    return `Week of ${start}`;
  }
  return formatLocalDate(bucket.periodStart, locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Compact currency text for axis ticks (1K, 2.5K, 1M). Full precision lives in tooltips and tables. */
export function compactMoney(minor: number, currency: string, locale: string): string {
  const major = minor / 10 ** currencyExponent(currency);
  const text = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.abs(major));
  return minor < 0 ? `−${text}` : text;
}

export interface TrendTotals {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

export function trendTotals(buckets: readonly TrendBucket[]): TrendTotals {
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const bucket of buckets) {
    incomeMinor += bucket.incomeMinor;
    expenseMinor += bucket.expenseMinor;
  }
  return { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
}

export function isEmptyTrend(buckets: readonly TrendBucket[]): boolean {
  return buckets.every((b) => b.incomeMinor === 0 && b.expenseMinor === 0);
}
