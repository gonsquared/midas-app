import { describe, expect, it } from 'vitest';
import { makeBudget } from '@/test/fixtures';
import {
  attentionAnnouncement,
  attentionSentence,
  groupBudgets,
  isCurrentPeriod,
  navigatorLabel,
  paceOf,
  shiftBudgetDate,
  stateLabel,
  topBudgets,
} from './budget-state';

describe('period navigation', () => {
  it('moves a month for All and Monthly, a week for Weekly and a year for Yearly', () => {
    expect(shiftBudgetDate('2026-10-16', 'all', -1)).toBe('2026-09-01');
    expect(shiftBudgetDate('2026-12-16', 'monthly', 1)).toBe('2027-01-01');
    expect(shiftBudgetDate('2026-10-16', 'weekly', -1)).toBe('2026-10-05');
    expect(shiftBudgetDate('2026-10-16', 'yearly', 1)).toBe('2027-10-16');
  });

  it('labels the navigator and detects the current period', () => {
    expect(navigatorLabel('2026-10-16', 'monthly', 'en-US')).toBe('October 2026');
    expect(navigatorLabel('2026-10-16', 'weekly', 'en-US')).toBe('Week of Oct 12');
    expect(navigatorLabel('2026-10-16', 'yearly', 'en-US')).toBe('2026');
    expect(isCurrentPeriod('2026-10-01', 'monthly', '2026-10-31')).toBe(true);
    expect(isCurrentPeriod('2026-09-30', 'monthly', '2026-10-31')).toBe(false);
    expect(isCurrentPeriod('2026-10-12', 'weekly', '2026-10-18')).toBe(true);
  });
});

describe('pace', () => {
  it('is the elapsed share of the period and days to go, null outside the period', () => {
    const { status } = makeBudget({ spentMinor: 0 });
    expect(paceOf(status, '2026-10-16')).toEqual({ fraction: 16 / 31, daysToGo: 15 });
    expect(paceOf(status, '2026-11-02')).toBeNull();
    expect(paceOf(null, '2026-10-16')).toBeNull();
  });
});

describe('grouping', () => {
  it('puts exceeded first, then near, pins overall first, and leaves the rest on track', () => {
    const groceries = makeBudget({ name: 'Groceries', spentMinor: 44520 });
    const dining = makeBudget({ name: 'Dining', amountMinor: 30000, spentMinor: 25500 });
    const transport = makeBudget({ name: 'Transport', spentMinor: 8000 });
    const overall = makeBudget({ overall: true, amountMinor: 400000, spentMinor: 310040 });
    const notStarted = makeBudget({ name: 'Trip', notStarted: true });
    const list = [transport, dining, overall, groceries, notStarted];
    const { attention, onTrack } = groupBudgets(list);
    expect(attention.map((b) => b.category?.name)).toEqual(['Groceries', 'Dining']);
    expect(onTrack.map((b) => (b.scope === 'overall' ? 'overall' : b.category?.name))).toEqual([
      'overall',
      'Transport',
      'Trip',
    ]);
  });

  it('keeps the top four for the dashboard, flagged first, skipping unstarted budgets', () => {
    const list = [
      makeBudget({ name: 'A', spentMinor: 1000 }),
      makeBudget({ name: 'B', spentMinor: 2000 }),
      makeBudget({ name: 'C', spentMinor: 3000 }),
      makeBudget({ name: 'D', spentMinor: 38000 }),
      makeBudget({ name: 'E', spentMinor: 45000 }),
      makeBudget({ name: 'F', notStarted: true }),
    ];
    expect(topBudgets(list, 4).map((b) => b.category?.name)).toEqual(['E', 'D', 'C', 'B']);
  });
});

describe('copy', () => {
  it('words each state with numbers', () => {
    expect(stateLabel(makeBudget({ spentMinor: 44520 }), 'en-US')).toBe('Over by $45.20');
    expect(stateLabel(makeBudget({ spentMinor: 40000 }), 'en-US')).toBe('Limit reached');
    const near = makeBudget({ amountMinor: 30000, spentMinor: 25500 });
    expect(stateLabel(near, 'en-US')).toBe('Near limit, 85% used');
    expect(stateLabel(makeBudget({ spentMinor: 100 }), 'en-US')).toBe('On track');
    expect(stateLabel(makeBudget({ notStarted: true }), 'en-US')).toBe('Starts Dec 1');
  });

  it('builds attention sentences and one announcement', () => {
    const groceries = makeBudget({ name: 'Groceries', spentMinor: 44520 });
    const dining = makeBudget({ name: 'Dining', amountMinor: 30000, spentMinor: 25500 });
    expect(attentionSentence(groceries, 'en-US')).toBe(
      'Groceries is over its monthly budget by $45.20.',
    );
    expect(attentionSentence(dining, 'en-US')).toBe('Dining is at 85% of its monthly budget.');
    expect(attentionAnnouncement([dining, groceries])).toBe(
      '2 budgets need attention: Groceries is over its limit, Dining is near its limit.',
    );
    expect(attentionAnnouncement([makeBudget({ spentMinor: 1 })])).toBe('');
  });

  it('never shows a warning as 100%', () => {
    const almost = makeBudget({ amountMinor: 100000, spentMinor: 99800 });
    expect(stateLabel(almost, 'en-US')).toBe('Near limit, 99% used');
  });
});
