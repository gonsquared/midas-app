import { describe, expect, it } from 'vitest';
import { chooseCurrency, parseDashboardSearch } from './search';

describe('parseDashboardSearch', () => {
  it('keeps the range and a well-formed currency code only', () => {
    expect(parseDashboardSearch({ range: 'last-30', currency: 'EUR' })).toEqual({
      range: 'last-30',
      currency: 'EUR',
    });
    expect(parseDashboardSearch({ currency: 'eur' })).toEqual({});
    expect(parseDashboardSearch({ currency: 'EURO' })).toEqual({});
    expect(parseDashboardSearch({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });
});

describe('chooseCurrency', () => {
  it('prefers the requested currency, then the preference, then the first', () => {
    expect(chooseCurrency('EUR', ['USD', 'EUR'], 'USD')).toBe('EUR');
    expect(chooseCurrency('GBP', ['USD', 'EUR'], 'USD')).toBe('USD');
    expect(chooseCurrency(undefined, ['EUR', 'GBP'], 'USD')).toBe('EUR');
    expect(chooseCurrency(undefined, [], 'USD')).toBeUndefined();
  });
});
