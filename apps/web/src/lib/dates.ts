/*
 * LocalDate helpers. A LocalDate is a `YYYY-MM-DD` calendar day with no time component (ADR-017).
 * Arithmetic runs in UTC so daylight saving shifts can never move a day.
 */

const MS_PER_DAY = 86_400_000;

function parts(value: string): [number, number, number] {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return [year, month, day];
}

function toUtc(value: string): Date {
  const [year, month, day] = parts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar day in the user's time zone (falls back to UTC for unknown zones). */
export function todayLocalDate(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return fromUtc(now);
  }
}

export function addDays(value: string, days: number): string {
  return fromUtc(new Date(toUtc(value).getTime() + days * MS_PER_DAY));
}

export function formatLocalDate(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(toUtc(value));
}

/** "Today", "Yesterday", otherwise "Fri, 16 Oct" (with the year outside the current year). */
export function formatDayHeading(value: string, locale: string, today: string): string {
  if (value === today) return 'Today';
  if (value === addDays(today, -1)) return 'Yesterday';
  const sameYear = parts(value)[0] === parts(today)[0];
  return formatLocalDate(value, locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export type DatePresetKey = 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'this-year';

export interface DateRange {
  from: string;
  to: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Concrete from/to ranges for the filter presets, relative to `today`. */
export function datePresets(today: string): Record<DatePresetKey, DateRange> {
  const [year, month] = parts(today);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return {
    'this-month': {
      from: `${year}-${pad(month)}-01`,
      to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
    },
    'last-month': {
      from: `${prevYear}-${pad(prevMonth)}-01`,
      to: `${prevYear}-${pad(prevMonth)}-${pad(lastDayOfMonth(prevYear, prevMonth))}`,
    },
    'last-30': { from: addDays(today, -29), to: today },
    'last-90': { from: addDays(today, -89), to: today },
    'this-year': { from: `${year}-01-01`, to: `${year}-12-31` },
  };
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / MS_PER_DAY);
}

/** Inclusive number of calendar days in a range. */
export function rangeLengthDays(range: DateRange): number {
  return daysBetween(range.from, range.to) + 1;
}

/** First day of the month containing `value`, moved by `months` months. */
export function startOfMonth(value: string, months = 0): string {
  const [year, month] = parts(value);
  const index = year * 12 + (month - 1) + months;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${pad((index % 12) + 1)}-01`;
}

export function endOfMonth(value: string): string {
  const [year, month] = parts(value);
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;
}

/** The Monday of the ISO week containing `value`. */
export function startOfWeek(value: string): string {
  const weekday = toUtc(value).getUTCDay(); // 0 = Sunday
  return addDays(value, -((weekday + 6) % 7));
}

/** The same day shifted by whole years (29 Feb moves to 28 Feb in a non-leap year). */
export function addYears(value: string, years: number): string {
  const [year, month, day] = parts(value);
  const target = year + years;
  return `${String(target).padStart(4, '0')}-${pad(month)}-${pad(Math.min(day, lastDayOfMonth(target, month)))}`;
}

/** True when the range covers exactly one calendar month. */
export function isWholeMonth(range: DateRange): boolean {
  return range.from === startOfMonth(range.from) && range.to === endOfMonth(range.from);
}
