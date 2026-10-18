import { addDays, addMonthsClamped, daysBetween, monthsBetween } from './dates.js';
import type { RecurringFrequency } from './enums.js';
import { LOCAL_DATE_MAX } from './money.js';

/**
 * Recurrence calculator (ADR-011, architecture 2.4). Occurrence N is always computed from the
 * start date, never from the previous occurrence, so monthly and yearly schedules keep their
 * anchor day (31 Jan, 28 Feb, 31 Mar) and never drift.
 */
export interface RecurrenceRule {
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
}

/** The date of occurrence `index` (0 is the start date), ignoring the end date. */
export function occurrenceDate(rule: RecurrenceRule, index: number): string {
  const steps = index * rule.interval;
  switch (rule.frequency) {
    case 'daily':
      return addDays(rule.startDate, steps);
    case 'weekly':
      return addDays(rule.startDate, steps * 7);
    case 'monthly':
      return addMonthsClamped(rule.startDate, steps);
    case 'yearly':
      return addMonthsClamped(rule.startDate, steps * 12);
  }
}

/** Last date a schedule may produce: its end date, capped by the ledger range. */
function lastAllowed(rule: RecurrenceRule): string {
  return rule.endDate !== null && rule.endDate < LOCAL_DATE_MAX ? rule.endDate : LOCAL_DATE_MAX;
}

/**
 * Index of the first occurrence on or after `date`, or null if every remaining occurrence would
 * fall after the end date (or the supported date range).
 */
export function firstOccurrenceIndexOnOrAfter(rule: RecurrenceRule, date: string): number | null {
  if (date <= rule.startDate) return rule.startDate <= lastAllowed(rule) ? 0 : null;
  let index: number;
  switch (rule.frequency) {
    case 'daily':
      index = Math.floor(daysBetween(rule.startDate, date) / rule.interval);
      break;
    case 'weekly':
      index = Math.floor(daysBetween(rule.startDate, date) / (7 * rule.interval));
      break;
    case 'monthly':
      index = Math.floor(monthsBetween(rule.startDate, date) / rule.interval);
      break;
    case 'yearly':
      index = Math.floor(monthsBetween(rule.startDate, date) / (12 * rule.interval));
      break;
  }
  // The estimate can be one step short because of month clamping; walk forward (at most a few steps).
  index = Math.max(0, index - 1);
  const limit = lastAllowed(rule);
  for (;;) {
    const candidate = occurrenceDate(rule, index);
    if (candidate > limit) return null;
    if (candidate >= date) return index;
    index += 1;
  }
}

/** First occurrence date on or after `date`, or null when the schedule has no further dates. */
export function firstOccurrenceOnOrAfter(rule: RecurrenceRule, date: string): string | null {
  const index = firstOccurrenceIndexOnOrAfter(rule, date);
  return index === null ? null : occurrenceDate(rule, index);
}

/** The occurrence that follows `current`, or null at the end of the schedule. */
export function nextOccurrenceAfter(rule: RecurrenceRule, current: string): string | null {
  return firstOccurrenceOnOrAfter(rule, addDays(current, 1));
}

/** Up to `count` occurrence dates on or after `fromDate` (the preview endpoint). */
export function listOccurrences(rule: RecurrenceRule, fromDate: string, count: number): string[] {
  const dates: string[] = [];
  let index = firstOccurrenceIndexOnOrAfter(rule, fromDate);
  const limit = lastAllowed(rule);
  while (index !== null && dates.length < count) {
    const date = occurrenceDate(rule, index);
    if (date > limit) break;
    dates.push(date);
    index += 1;
  }
  return dates;
}
