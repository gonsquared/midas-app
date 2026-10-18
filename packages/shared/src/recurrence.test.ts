import { describe, expect, it } from 'vitest';
import {
  firstOccurrenceOnOrAfter,
  listOccurrences,
  nextOccurrenceAfter,
  occurrenceDate,
  type RecurrenceRule,
} from './recurrence.js';

const rule = (overrides: Partial<RecurrenceRule>): RecurrenceRule => ({
  frequency: 'monthly',
  interval: 1,
  startDate: '2026-01-31',
  endDate: null,
  ...overrides,
});

describe('recurrence calculator (ADR-011)', () => {
  it('moves monthly occurrences to the last day of short months without drifting', () => {
    expect(listOccurrences(rule({}), '2026-01-01', 5)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(occurrenceDate(rule({ startDate: '2028-01-31' }), 1)).toBe('2028-02-29');
  });

  it('yearly occurrences anchored on 29 February use 28 February in common years', () => {
    const r = rule({ frequency: 'yearly', startDate: '2028-02-29' });
    expect(listOccurrences(r, '2028-01-01', 3)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28']);
    expect(occurrenceDate(r, 4)).toBe('2032-02-29');
  });

  it('supports daily and weekly schedules with intervals', () => {
    const daily = rule({ frequency: 'daily', interval: 3, startDate: '2026-10-01' });
    expect(listOccurrences(daily, '2026-10-01', 4)).toEqual([
      '2026-10-01',
      '2026-10-04',
      '2026-10-07',
      '2026-10-10',
    ]);
    const weekly = rule({ frequency: 'weekly', interval: 2, startDate: '2026-10-05' });
    expect(listOccurrences(weekly, '2026-10-06', 3)).toEqual([
      '2026-10-19',
      '2026-11-02',
      '2026-11-16',
    ]);
  });

  it('every-two-months and every-two-years use the interval', () => {
    const bimonthly = rule({ interval: 2, startDate: '2026-01-15' });
    expect(listOccurrences(bimonthly, '2026-01-01', 3)).toEqual([
      '2026-01-15',
      '2026-03-15',
      '2026-05-15',
    ]);
    const biennial = rule({ frequency: 'yearly', interval: 2, startDate: '2026-06-01' });
    expect(listOccurrences(biennial, '2027-01-01', 2)).toEqual(['2028-06-01', '2030-06-01']);
  });

  it('finds the first occurrence on or after a date', () => {
    const r = rule({ startDate: '2026-01-15' });
    expect(firstOccurrenceOnOrAfter(r, '2026-01-15')).toBe('2026-01-15');
    expect(firstOccurrenceOnOrAfter(r, '2026-01-16')).toBe('2026-02-15');
    expect(firstOccurrenceOnOrAfter(r, '2026-12-15')).toBe('2026-12-15');
    expect(firstOccurrenceOnOrAfter(r, '2025-06-01')).toBe('2026-01-15');
  });

  it('handles clamped months when searching', () => {
    expect(firstOccurrenceOnOrAfter(rule({}), '2026-02-10')).toBe('2026-02-28');
    expect(firstOccurrenceOnOrAfter(rule({}), '2026-03-01')).toBe('2026-03-31');
  });

  it('stops at the end date, inclusive', () => {
    const r = rule({ frequency: 'daily', startDate: '2026-10-01', endDate: '2026-10-03' });
    expect(listOccurrences(r, '2026-10-01', 10)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(nextOccurrenceAfter(r, '2026-10-03')).toBeNull();
    expect(nextOccurrenceAfter(r, '2026-10-02')).toBe('2026-10-03');
    expect(firstOccurrenceOnOrAfter(r, '2026-10-04')).toBeNull();
  });

  it('never goes past the supported date range', () => {
    const r = rule({ frequency: 'yearly', startDate: '2099-06-01' });
    expect(listOccurrences(r, '2099-01-01', 5)).toEqual(['2099-06-01', '2100-06-01']);
    expect(nextOccurrenceAfter(r, '2100-06-01')).toBeNull();
  });

  it('nextOccurrenceAfter advances one step and is stable across a long catch-up', () => {
    const r = rule({ frequency: 'weekly', startDate: '2026-01-05' });
    let current = r.startDate;
    for (let i = 0; i < 100; i++) {
      const next = nextOccurrenceAfter(r, current);
      expect(next).toBe(occurrenceDate(r, i + 1));
      current = next as string;
    }
  });
});
