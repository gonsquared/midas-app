import type { CategoryType, TrendGroupBy } from '@midas/shared';
import { TREND_GROUP_BY } from '@midas/shared/enums';
import { parseRangeSearch, type RangeSearch } from './range';

export interface ReportsSearch extends RangeSearch {
  currency?: string;
  /** Omitted for "Auto" (the server picks day, week or month from the range). */
  group?: TrendGroupBy;
  /** Omitted for expenses. */
  type?: 'income';
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function parseReportsSearch(raw: Record<string, unknown>): ReportsSearch {
  const result: ReportsSearch = parseRangeSearch(raw);
  const currency = raw['currency'];
  if (typeof currency === 'string' && CURRENCY_CODE.test(currency)) result.currency = currency;
  const group = raw['group'];
  if (typeof group === 'string' && (TREND_GROUP_BY as readonly string[]).includes(group)) {
    result.group = group as TrendGroupBy;
  }
  if (raw['type'] === 'income') result.type = 'income';
  return result;
}

export const toCategoryType = (search: ReportsSearch): CategoryType => search.type ?? 'expense';

/**
 * "You kept 26% of your income" (ui-design 6.10), in integer math and rounded down. Null when
 * there is no income; a loss reads as a plain sentence.
 */
export function keptSentence(incomeMinor: number, netMinor: number): string | null {
  if (incomeMinor <= 0) return null;
  if (netMinor < 0) return 'You spent more than you earned this period.';
  const percent = (BigInt(netMinor) * 100n) / BigInt(incomeMinor);
  return `You kept ${percent}% of your income.`;
}

/** A coarser grouping to suggest when a range has too many buckets (RANGE_TOO_LARGE). */
export function suggestGrouping(current: TrendGroupBy | undefined): TrendGroupBy {
  return current === 'day' ? 'week' : 'month';
}
