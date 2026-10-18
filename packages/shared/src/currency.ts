import type { CurrencyCode } from './locale.js';

/**
 * ISO 4217 minor-unit exponents of the supported currencies (ADR-009). Every currency not listed
 * here has an exponent of 2. Formatting for display happens in the UI with `Intl.NumberFormat`;
 * this table exists for server-side plain decimals such as the CSV export.
 */
const ZERO_DECIMAL: ReadonlySet<string> = new Set(['JPY', 'KRW', 'VND', 'ISK', 'CLP']);

export function currencyExponent(currency: CurrencyCode | string): number {
  return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

/**
 * Plain decimal string for a signed integer amount in minor units, for example
 * (-1250, 'USD') -> '-12.50' and (500, 'JPY') -> '500'. Never goes through a float.
 */
export function minorToDecimal(amountMinor: number, currency: CurrencyCode | string): string {
  const exponent = currencyExponent(currency);
  const negative = amountMinor < 0;
  const digits = BigInt(Math.abs(amountMinor)).toString();
  if (exponent === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(exponent + 1, '0');
  const whole = padded.slice(0, -exponent);
  const fraction = padded.slice(-exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
