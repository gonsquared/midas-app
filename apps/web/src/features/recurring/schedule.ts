import type { RecurringFrequency } from '@midas/shared';
import { formatLocalDate } from '@/lib/dates';

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th" (English; the product copy is English). */
export function ordinal(value: number): string {
  const rest = value % 100;
  if (rest >= 11 && rest <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export interface ScheduleLike {
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
}

const UNIT: Record<RecurringFrequency, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

const ADVERB: Record<RecurringFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/**
 * Human schedule text generated from the fields (ui-design 6.8): "Every 2 weeks on Friday",
 * "Monthly on the 31st (last day in short months)".
 */
export function scheduleText(schedule: ScheduleLike, locale: string): string {
  const { frequency, interval, startDate } = schedule;
  const lead = interval === 1 ? ADVERB[frequency] : `Every ${interval} ${UNIT[frequency]}s`;
  const day = Number(startDate.slice(8, 10));
  switch (frequency) {
    case 'daily':
      return lead;
    case 'weekly':
      return `${lead} on ${formatLocalDate(startDate, locale, { weekday: 'long' })}`;
    case 'monthly':
      return `${lead} on the ${ordinal(day)}${day > 28 ? ' (last day in short months)' : ''}`;
    case 'yearly': {
      const when = formatLocalDate(startDate, locale, { day: 'numeric', month: 'short' });
      return `${lead} on ${when}${startDate.slice(5) === '02-29' ? ' (28 Feb in other years)' : ''}`;
    }
  }
}

/**
 * True when a monthly or yearly occurrence fell on an earlier day than the start day because the
 * month is shorter (31 Jan, 28 Feb): such dates carry an info mark in the preview.
 */
export function isClamped(date: string, schedule: ScheduleLike): boolean {
  if (schedule.frequency !== 'monthly' && schedule.frequency !== 'yearly') return false;
  return Number(date.slice(8, 10)) < Number(schedule.startDate.slice(8, 10));
}

/** Friendly sentence for the machine code the generator stores when it pauses a template. */
export function failureSentence(code: string | null): string {
  switch (code) {
    case 'WALLET_ARCHIVED':
      return 'The wallet was archived.';
    case 'CATEGORY_RETIRED':
      return 'The category was retired.';
    case 'DATABASE_ERROR':
    case 'GENERATION_FAILED':
      return 'Something went wrong while adding it.';
    default:
      return 'The last attempt failed.';
  }
}
