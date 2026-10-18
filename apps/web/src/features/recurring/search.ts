import type { RecurringStatus } from '@midas/shared';
import { RECURRING_STATUSES } from '@midas/shared/enums';

export interface RecurringSearch {
  /** Omitted for "All". */
  status?: RecurringStatus;
}

export function parseRecurringSearch(raw: Record<string, unknown>): RecurringSearch {
  const status = raw['status'];
  return typeof status === 'string' && (RECURRING_STATUSES as readonly string[]).includes(status)
    ? { status: status as RecurringStatus }
    : {};
}
