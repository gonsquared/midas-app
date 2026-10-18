import { isValidLocalDate } from '@midas/shared/money';
import { isPeriodFilter, type PeriodFilter } from './budget-state';

export interface BudgetsSearch {
  /** Omitted for "All". */
  period?: Exclude<PeriodFilter, 'all'>;
  /** Any LocalDate inside the viewed period; omitted for the current one. */
  date?: string;
}

export function parseBudgetsSearch(raw: Record<string, unknown>): BudgetsSearch {
  const result: BudgetsSearch = {};
  const period = raw['period'];
  if (isPeriodFilter(period) && period !== 'all') result.period = period;
  const date = raw['date'];
  if (typeof date === 'string' && isValidLocalDate(date)) result.date = date;
  return result;
}
