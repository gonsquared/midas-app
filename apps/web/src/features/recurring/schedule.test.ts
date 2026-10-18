import { describe, expect, it } from 'vitest';
import { failureSentence, isClamped, ordinal, scheduleText } from './schedule';

describe('ordinal', () => {
  it('handles the English irregulars', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '30th',
      '31st',
    ]);
  });
});

describe('scheduleText', () => {
  const at = (
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
    interval: number,
    startDate: string,
  ) => scheduleText({ frequency, interval, startDate }, 'en-US');

  it('reads naturally for each frequency', () => {
    expect(at('daily', 1, '2026-10-16')).toBe('Daily');
    expect(at('daily', 3, '2026-10-16')).toBe('Every 3 days');
    expect(at('weekly', 2, '2026-10-16')).toBe('Every 2 weeks on Friday');
    expect(at('weekly', 1, '2026-10-12')).toBe('Weekly on Monday');
    expect(at('monthly', 1, '2026-01-01')).toBe('Monthly on the 1st');
    expect(at('monthly', 2, '2026-01-30')).toBe(
      'Every 2 months on the 30th (last day in short months)',
    );
    expect(at('yearly', 1, '2026-03-05')).toBe('Yearly on Mar 5');
  });

  it('explains 29 February', () => {
    expect(at('yearly', 1, '2028-02-29')).toBe('Yearly on Feb 29 (28 Feb in other years)');
  });
});

describe('isClamped', () => {
  const monthly = { frequency: 'monthly' as const, interval: 1, startDate: '2026-01-31' };
  it('flags dates that moved to the last day of a shorter month', () => {
    expect(isClamped('2026-02-28', monthly)).toBe(true);
    expect(isClamped('2026-03-31', monthly)).toBe(false);
    expect(isClamped('2026-02-28', { ...monthly, frequency: 'weekly' })).toBe(false);
  });
});

describe('failureSentence', () => {
  it('translates stored codes and never shows raw ones', () => {
    expect(failureSentence('WALLET_ARCHIVED')).toBe('The wallet was archived.');
    expect(failureSentence('CATEGORY_RETIRED')).toBe('The category was retired.');
    expect(failureSentence('GENERATION_FAILED')).toBe('Something went wrong while adding it.');
    expect(failureSentence('WHATEVER')).toBe('The last attempt failed.');
    expect(failureSentence(null)).toBe('The last attempt failed.');
  });
});
