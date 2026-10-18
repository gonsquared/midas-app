import { describe, expect, it } from 'vitest';
import { currencyExponent, minorToDecimal } from './currency.js';

describe('minorToDecimal', () => {
  it('formats two-decimal currencies without floats', () => {
    expect(minorToDecimal(1250, 'USD')).toBe('12.50');
    expect(minorToDecimal(-1250, 'EUR')).toBe('-12.50');
    expect(minorToDecimal(5, 'USD')).toBe('0.05');
    expect(minorToDecimal(0, 'USD')).toBe('0.00');
    expect(minorToDecimal(-1, 'GBP')).toBe('-0.01');
  });

  it('formats zero-decimal currencies as whole numbers', () => {
    expect(minorToDecimal(500, 'JPY')).toBe('500');
    expect(minorToDecimal(-500, 'KRW')).toBe('-500');
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('USD')).toBe(2);
  });

  it('is exact at the top of the supported range', () => {
    expect(minorToDecimal(100_000_000_000_000, 'USD')).toBe('1000000000000.00');
    expect(minorToDecimal(-99_999_999_999_999, 'USD')).toBe('-999999999999.99');
  });
});
