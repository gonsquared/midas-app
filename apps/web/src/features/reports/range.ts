import { REPORT_MAX_RANGE_DAYS } from '@midas/shared/reports';
import { isValidLocalDate } from '@midas/shared/money';
import {
  datePresets,
  endOfMonth,
  formatLocalDate,
  isWholeMonth,
  rangeLengthDays,
  startOfMonth,
  type DatePresetKey,
  type DateRange,
} from '@/lib/dates';

export type RangePreset = DatePresetKey;

/** Presets in menu order (ui-design 6.3: this month, last 30 days, year, plus a custom range). */
export const RANGE_PRESETS: readonly RangePreset[] = [
  'this-month',
  'last-month',
  'last-30',
  'last-90',
  'this-year',
];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-30': 'Last 30 days',
  'last-90': 'Last 90 days',
  'this-year': 'This year',
};

export const DEFAULT_PRESET: RangePreset = 'this-month';

/** What the URL carries for a range: a preset key, or an explicit from and to. */
export interface RangeSearch {
  range?: RangePreset;
  from?: string;
  to?: string;
}

export function isRangePreset(value: unknown): value is RangePreset {
  return typeof value === 'string' && (RANGE_PRESETS as readonly string[]).includes(value);
}

/** Keeps only a valid range: an ordered custom pair within the report limit, or a known preset. */
export function parseRangeSearch(raw: Record<string, unknown>): RangeSearch {
  const from = typeof raw['from'] === 'string' && isValidLocalDate(raw['from']) ? raw['from'] : '';
  const to = typeof raw['to'] === 'string' && isValidLocalDate(raw['to']) ? raw['to'] : '';
  if (from && to && to >= from && rangeLengthDays({ from, to }) <= REPORT_MAX_RANGE_DAYS) {
    return { from, to };
  }
  if (isRangePreset(raw['range']) && raw['range'] !== DEFAULT_PRESET) {
    return { range: raw['range'] };
  }
  return {};
}

export interface ResolvedRange {
  range: DateRange;
  /** The preset when the URL names one (or nothing), otherwise "custom". */
  kind: RangePreset | 'custom';
}

export function resolveRange(search: RangeSearch, today: string): ResolvedRange {
  if (search.from && search.to) {
    return { range: { from: search.from, to: search.to }, kind: 'custom' };
  }
  const preset = search.range ?? DEFAULT_PRESET;
  return { range: datePresets(today)[preset], kind: preset };
}

/** The shortest URL form of a range: nothing for the default, a preset key, or from and to. */
export function rangeToSearch(range: DateRange, today: string): RangeSearch {
  const presets = datePresets(today);
  const match = RANGE_PRESETS.find(
    (key) => presets[key].from === range.from && presets[key].to === range.to,
  );
  if (match) return match === DEFAULT_PRESET ? {} : { range: match };
  return { from: range.from, to: range.to };
}

/** Previous and next arrows only make sense for a whole calendar month. */
export function canStepMonth(range: DateRange): boolean {
  return isWholeMonth(range);
}

export function stepMonth(range: DateRange, direction: -1 | 1): DateRange {
  const from = startOfMonth(range.from, direction);
  return { from, to: endOfMonth(from) };
}

export function rangeLabel(range: DateRange, locale: string): string {
  if (isWholeMonth(range)) {
    return formatLocalDate(range.from, locale, { month: 'long', year: 'numeric' });
  }
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const start = formatLocalDate(range.from, locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const end = formatLocalDate(range.to, locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${start} to ${end}`;
}

export { REPORT_MAX_RANGE_DAYS };
