import { MAX_AMOUNT_MINOR } from '@midas/shared/money';

/*
 * Money helpers. Amounts are always integer minor units; text is converted with string and
 * integer arithmetic, never through floating point multiplication (ui-design 18.3.11).
 */

const MINUS = '−';
const exponentCache = new Map<string, number>();

/** Number of minor-unit decimals for the currency (JPY 0, USD 2, KWD 3). */
export function currencyExponent(currency: string): number {
  const cached = exponentCache.get(currency);
  if (cached !== undefined) return cached;
  let exponent: number;
  try {
    exponent =
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    exponent = 2;
  }
  exponentCache.set(currency, exponent);
  return exponent;
}

/** Plain decimal string for integer minor units, for example 5420 -> "54.20". */
function minorToDecimalString(minor: number, exponent: number): string {
  const negative = minor < 0;
  const digits = String(Math.abs(Math.trunc(minor))).padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export type SignMode = 'auto' | 'always' | 'never';

export interface FormatOptions {
  sign?: SignMode;
}

/** Formats minor units for display with the true minus sign (U+2212). */
export function formatMinor(
  minor: number,
  currency: string,
  locale: string,
  options: FormatOptions = {},
): string {
  const exponent = currencyExponent(currency);
  const sign = options.sign ?? 'auto';
  const magnitude = minorToDecimalString(Math.abs(minor), exponent);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  // Intl accepts decimal strings, which keeps 10^14 minor units exact.
  const body = formatter.format(magnitude as unknown as number);
  if (sign === 'never' || minor === 0) return body;
  if (minor < 0) return `${MINUS}${body}`;
  return sign === 'always' ? `+${body}` : body;
}

interface Separators {
  decimal: string;
  group: string;
}
const separatorCache = new Map<string, Separators>();

function separatorsFor(locale: string): Separators {
  const cached = separatorCache.get(locale);
  if (cached) return cached;
  const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(1234567.5);
  const result = {
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
  };
  separatorCache.set(locale, result);
  return result;
}

export type ParseMoneyResult =
  | { ok: true; minor: number | null }
  | { ok: false; reason: 'format' | 'decimals' | 'negative' | 'range' };

export interface ParseMoneyOptions {
  currency: string;
  locale: string;
  allowNegative?: boolean;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RIGHT_QUOTE = String.fromCharCode(0x2019);
const SPACE_LIKE = /\s/u;

/**
 * Parses what a person types or pastes into integer minor units. An empty value is `null`.
 * More decimals than the currency allows is an error (never silent rounding); trailing zeros
 * beyond the exponent are tolerated ("12.340" in USD).
 */
export function parseMoney(input: string, options: ParseMoneyOptions): ParseMoneyResult {
  const { currency, locale, allowNegative = false } = options;
  const exponent = currencyExponent(currency);
  const { decimal, group } = separatorsFor(locale);

  let text = input.trim().replace(/[−‒–]/g, '-');
  if (text === '') return { ok: true, minor: null };

  // Drop currency symbols and the ISO code (pasted "$1,234.56" or "USD 12").
  text = text.replace(/\p{Sc}/gu, '').replace(new RegExp(escapeRegExp(currency), 'gi'), '');
  const groupIsSpaceLike = SPACE_LIKE.test(group) || group === RIGHT_QUOTE;
  text = text.replace(/\s/gu, '').replaceAll(RIGHT_QUOTE, '');

  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  // Where the locale decimal is a comma, a dot is accepted as the decimal point too.
  if (decimal === ',' && group !== '.') text = text.replaceAll('.', ',');

  const d = escapeRegExp(decimal);
  const g = escapeRegExp(group);
  const grouped = groupIsSpaceLike ? null : new RegExp(`^\\d{1,3}(?:${g}\\d{3})+(?:${d}\\d*)?$`);
  const plain = new RegExp(`^\\d*(?:${d}\\d*)?$`);
  let normalized: string | null = null;
  if (grouped?.test(text)) normalized = text.replaceAll(group, '');
  else if (plain.test(text) && /\d/.test(text)) normalized = text;
  if (normalized === null) return { ok: false, reason: 'format' };

  const [wholeRaw = '', fractionRaw = ''] = normalized.split(decimal);
  let fraction = fractionRaw;
  if (fraction.length > exponent) {
    if (/[^0]/.test(fraction.slice(exponent))) return { ok: false, reason: 'decimals' };
    fraction = fraction.slice(0, exponent);
  }
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  if (whole.length > 16) return { ok: false, reason: 'range' };
  const magnitude = Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, '0') || '0');
  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_AMOUNT_MINOR) {
    return { ok: false, reason: 'range' };
  }
  if (negative && magnitude !== 0 && !allowNegative) return { ok: false, reason: 'negative' };
  return { ok: true, minor: negative && magnitude !== 0 ? -magnitude : magnitude };
}

/** Text for an input's initial value: no grouping, locale decimal separator, plain minus. */
export function toEditableAmount(minor: number, currency: string, locale: string): string {
  const text = minorToDecimalString(minor, currencyExponent(currency));
  return text.replace('.', separatorsFor(locale).decimal);
}
