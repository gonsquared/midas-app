import type { TrendBucket } from '@midas/shared';
import { describe, expect, it } from 'vitest';
import { axisLabel, compactMoney, isEmptyTrend, periodLabel, trendTotals } from './trend-format';

const bucket = (start: string, income: number, expense: number): TrendBucket => ({
  periodStart: start,
  periodEnd: start,
  incomeMinor: income,
  expenseMinor: expense,
  netMinor: income - expense,
});

describe('labels', () => {
  const single = { from: '2026-10-01', to: '2026-10-31' };
  it('labels days, weeks and months for axes and readouts', () => {
    const b = bucket('2026-10-12', 0, 0);
    expect(axisLabel(b, { ...single, groupBy: 'week' }, 'en-US')).toBe('Oct 12');
    expect(periodLabel(b, 'week', 'en-US')).toBe('Week of Oct 12');
    expect(periodLabel(b, 'day', 'en-US')).toBe('Mon, Oct 12, 2026');
    expect(periodLabel(b, 'month', 'en-US')).toBe('October 2026');
    expect(axisLabel(b, { ...single, groupBy: 'month' }, 'en-US')).toBe('Oct');
  });

  it('adds the year to month labels when the range crosses years', () => {
    const b = bucket('2026-01-01', 0, 0);
    const trend = { from: '2025-11-01', to: '2026-02-28', groupBy: 'month' as const };
    expect(axisLabel(b, trend, 'en-US')).toBe('Jan 26');
  });
});

describe('numbers', () => {
  it('compacts axis ticks and keeps a true minus', () => {
    expect(compactMoney(250000, 'USD', 'en-US')).toBe('$2.5K');
    expect(compactMoney(-100000000, 'USD', 'en-US')).toBe('−$1M');
    expect(compactMoney(500, 'JPY', 'en-US')).toContain('500');
  });

  it('sums buckets and detects an empty range', () => {
    const list = [bucket('2026-10-01', 1000, 400), bucket('2026-10-08', 0, 250)];
    expect(trendTotals(list)).toEqual({ incomeMinor: 1000, expenseMinor: 650, netMinor: 350 });
    expect(isEmptyTrend(list)).toBe(false);
    expect(isEmptyTrend([bucket('2026-10-01', 0, 0)])).toBe(true);
  });
});
