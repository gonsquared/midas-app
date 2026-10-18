import { LOCAL_DATE_MAX, LOCAL_DATE_MIN } from './money.js';

/**
 * Calendar-date arithmetic on `YYYY-MM-DD` strings (ADR-017). Everything runs in UTC on date
 * parts, so a result never depends on the server time zone or on daylight saving time.
 */

const MS_PER_DAY = 86_400_000;

function parts(date: string): [number, number, number] {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return [year, month, day];
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function formatDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function toUtcMs(date: string): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  const date = new Date(ms);
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Adds (or subtracts) whole days. */
export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** `to - from` in whole days (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Number of calendar days in the inclusive range `from..to`. */
export function inclusiveDays(from: string, to: string): number {
  return daysBetween(from, to) + 1;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adds whole months to an anchor date. If the anchor day does not exist in the target month the
 * result moves to the month's last day (31 Jan + 1 month = 28 or 29 Feb). Anchoring every result
 * on the original date, never on the previous result, keeps 31 Jan, 28 Feb, 31 Mar.
 */
export function addMonthsClamped(anchor: string, months: number): string {
  const [y, m, d] = parts(anchor);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return formatDate(year, month, Math.min(d, daysInMonth(year, month)));
}

/** Months from the month of `from` to the month of `to` (ignores the day). */
export function monthsBetween(from: string, to: string): number {
  const [y1, m1] = parts(from);
  const [y2, m2] = parts(to);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** ISO weekday of a date: 1 = Monday .. 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(toUtcMs(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

export type CalendarPeriod = 'weekly' | 'monthly' | 'yearly';

/** First day of the calendar period (ISO Monday weeks, ADR-012) that contains `date`. */
export function periodStart(period: CalendarPeriod, date: string): string {
  const [y, m] = parts(date);
  switch (period) {
    case 'weekly':
      return addDays(date, -(isoWeekday(date) - 1));
    case 'monthly':
      return formatDate(y, m, 1);
    case 'yearly':
      return formatDate(y, 1, 1);
  }
}

/** Last day (inclusive) of the calendar period that contains `date`. */
export function periodEnd(period: CalendarPeriod, date: string): string {
  const [y, m] = parts(date);
  switch (period) {
    case 'weekly':
      return addDays(periodStart('weekly', date), 6);
    case 'monthly':
      return formatDate(y, m, daysInMonth(y, m));
    case 'yearly':
      return formatDate(y, 12, 31);
  }
}

/** The start of the period that follows the one containing `date`. */
export function nextPeriodStart(period: CalendarPeriod, date: string): string {
  return addDays(periodEnd(period, date), 1);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The calendar date `instant` falls on in an IANA time zone (ADR-017): the user's "today".
 * An unknown zone name falls back to UTC rather than failing a request.
 */
export function dateInTimeZone(instant: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
    formatters.set(timeZone, formatter);
  }
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of formatter.formatToParts(instant)) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
  }
  return formatDate(year, month, day);
}

/** Clamps a date into the supported ledger range (1900-01-01..2100-12-31). */
export function clampToLedgerRange(date: string): string {
  if (date < LOCAL_DATE_MIN) return LOCAL_DATE_MIN;
  if (date > LOCAL_DATE_MAX) return LOCAL_DATE_MAX;
  return date;
}
