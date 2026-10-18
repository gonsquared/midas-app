import { parseRangeSearch, type RangeSearch } from '@/features/reports/range';

export interface DashboardSearch extends RangeSearch {
  currency?: string;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function parseDashboardSearch(raw: Record<string, unknown>): DashboardSearch {
  const result: DashboardSearch = parseRangeSearch(raw);
  const currency = raw['currency'];
  if (typeof currency === 'string' && CURRENCY_CODE.test(currency)) result.currency = currency;
  return result;
}

/**
 * The currency every widget uses. Totals are never summed across currencies, so exactly one is
 * chosen: the requested one if the user has it, else their preference, else the first.
 */
export function chooseCurrency(
  requested: string | undefined,
  available: readonly string[],
  preferred: string,
): string | undefined {
  if (requested && available.includes(requested)) return requested;
  if (available.includes(preferred)) return preferred;
  return available[0];
}
