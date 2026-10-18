import { describe, expect, it } from 'vitest';
import { keptSentence, parseReportsSearch, suggestGrouping } from './search';

describe('parseReportsSearch', () => {
  it('keeps the range, currency, grouping and income type', () => {
    expect(
      parseReportsSearch({ range: 'last-90', currency: 'EUR', group: 'week', type: 'income' }),
    ).toEqual({ range: 'last-90', currency: 'EUR', group: 'week', type: 'income' });
  });

  it('drops unknown grouping, currency shapes and types', () => {
    expect(parseReportsSearch({ group: 'year', currency: 'usd', type: 'expense' })).toEqual({});
  });
});

describe('keptSentence', () => {
  it('uses integer math rounded down', () => {
    expect(keptSentence(420000, 109960)).toBe('You kept 26% of your income.');
    expect(keptSentence(300, 100)).toBe('You kept 33% of your income.');
  });

  it('is hidden without income and reads plainly for a loss', () => {
    expect(keptSentence(0, -500)).toBeNull();
    expect(keptSentence(1000, -1)).toBe('You spent more than you earned this period.');
  });
});

describe('suggestGrouping', () => {
  it('suggests the next coarser grouping', () => {
    expect(suggestGrouping('day')).toBe('week');
    expect(suggestGrouping('week')).toBe('month');
    expect(suggestGrouping(undefined)).toBe('month');
  });
});
