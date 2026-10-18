import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_MINOR } from '@midas/shared/money';
import {
  currencyExponent,
  formatMinor,
  parseMoney,
  toEditableAmount,
  type ParseMoneyResult,
} from './money';

const usd = { currency: 'USD', locale: 'en-US' } as const;

function minorOf(result: ParseMoneyResult): number | null | string {
  return result.ok ? result.minor : result.reason;
}

describe('currencyExponent', () => {
  it('knows zero, two and three decimal currencies', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('KWD')).toBe(3);
  });
});

describe('formatMinor', () => {
  it('formats integer minor units without float drift', () => {
    expect(formatMinor(5420, 'USD', 'en-US')).toBe('$54.20');
    expect(formatMinor(1, 'USD', 'en-US')).toBe('$0.01');
    expect(formatMinor(MAX_AMOUNT_MINOR, 'USD', 'en-US')).toBe('$1,000,000,000,000.00');
    expect(formatMinor(1999, 'JPY', 'en-US')).toContain('1,999');
  });

  it('uses a true minus sign and optional explicit plus', () => {
    expect(formatMinor(-5420, 'USD', 'en-US')).toBe('−$54.20');
    expect(formatMinor(5420, 'USD', 'en-US', { sign: 'always' })).toBe('+$54.20');
    expect(formatMinor(-5420, 'USD', 'en-US', { sign: 'never' })).toBe('$54.20');
    expect(formatMinor(0, 'USD', 'en-US', { sign: 'always' })).toBe('$0.00');
  });

  it('follows the locale', () => {
    expect(formatMinor(123456, 'EUR', 'de-DE')).toContain('1.234,56');
  });
});

describe('parseMoney', () => {
  it('parses plain and grouped input to minor units', () => {
    expect(minorOf(parseMoney('54.20', usd))).toBe(5420);
    expect(minorOf(parseMoney('1,234.5', usd))).toBe(123450);
    expect(minorOf(parseMoney('$1,234.56', usd))).toBe(123456);
    expect(minorOf(parseMoney('USD 12', usd))).toBe(1200);
    expect(minorOf(parseMoney('7', usd))).toBe(700);
    expect(minorOf(parseMoney('.5', usd))).toBe(50);
  });

  it('treats an empty value as null', () => {
    expect(minorOf(parseMoney('   ', usd))).toBeNull();
  });

  it('respects the locale decimal separator', () => {
    const de = { currency: 'EUR', locale: 'de-DE' } as const;
    expect(minorOf(parseMoney('1.234,56', de))).toBe(123456);
    expect(minorOf(parseMoney('12,5', de))).toBe(1250);
    const fr = { currency: 'EUR', locale: 'fr-FR' } as const;
    expect(minorOf(parseMoney('1 234,56', fr))).toBe(123456);
    expect(minorOf(parseMoney('12.50', fr))).toBe(1250);
  });

  it('rejects more decimals than the currency allows instead of rounding', () => {
    expect(minorOf(parseMoney('12.345', usd))).toBe('decimals');
    expect(minorOf(parseMoney('12.5', { currency: 'JPY', locale: 'en-US' }))).toBe('decimals');
    expect(minorOf(parseMoney('12.340', usd))).toBe(1234);
    expect(minorOf(parseMoney('1.234', { currency: 'KWD', locale: 'en-US' }))).toBe(1234);
  });

  it('rejects malformed input', () => {
    for (const bad of ['abc', '1.2.3', '12,34', '1,2345.00', '--5', '5-', '1e5', '0x10', '.']) {
      expect(minorOf(parseMoney(bad, usd)), bad).toBe('format');
    }
  });

  it('handles signs', () => {
    expect(minorOf(parseMoney('-5.00', usd))).toBe('negative');
    expect(minorOf(parseMoney('-5.00', { ...usd, allowNegative: true }))).toBe(-500);
    expect(minorOf(parseMoney('−5.00', { ...usd, allowNegative: true }))).toBe(-500);
    expect(minorOf(parseMoney('+5.00', usd))).toBe(500);
  });

  it('rejects amounts above the maximum', () => {
    expect(minorOf(parseMoney('1000000000000.00', usd))).toBe(MAX_AMOUNT_MINOR);
    expect(minorOf(parseMoney('1000000000000.01', usd))).toBe('range');
    expect(minorOf(parseMoney('99999999999999999999', usd))).toBe('range');
  });
});

describe('toEditableAmount', () => {
  it('round-trips through parseMoney without grouping', () => {
    expect(toEditableAmount(123456, 'USD', 'en-US')).toBe('1234.56');
    expect(toEditableAmount(123456, 'EUR', 'de-DE')).toBe('1234,56');
    expect(toEditableAmount(-500, 'USD', 'en-US')).toBe('-5.00');
    expect(toEditableAmount(1999, 'JPY', 'en-US')).toBe('1999');
    const de = { currency: 'EUR', locale: 'de-DE' } as const;
    expect(minorOf(parseMoney(toEditableAmount(123456, 'EUR', 'de-DE'), de))).toBe(123456);
  });
});
