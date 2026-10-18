import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  dateInTimeZone,
  daysBetween,
  inclusiveDays,
  isoWeekday,
  periodEnd,
  periodStart,
} from './dates.js';

describe('date arithmetic', () => {
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-02-01', '2026-01-01')).toBe(-31);
    expect(inclusiveDays('2026-10-01', '2026-10-31')).toBe(31);
  });

  it('keeps the anchor day and clamps to the last day of short months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('numbers ISO weekdays from Monday', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-25')).toBe(7);
  });
});

describe('calendar periods (ADR-012)', () => {
  it('weekly periods run Monday to Sunday', () => {
    expect(periodStart('weekly', '2026-10-18')).toBe('2026-10-12');
    expect(periodEnd('weekly', '2026-10-18')).toBe('2026-10-18');
    expect(periodStart('weekly', '2026-10-19')).toBe('2026-10-19');
    expect(periodEnd('weekly', '2026-10-19')).toBe('2026-10-25');
  });

  it('weekly periods may straddle a year boundary', () => {
    expect(periodStart('weekly', '2027-01-01')).toBe('2026-12-28');
    expect(periodEnd('weekly', '2026-12-30')).toBe('2027-01-03');
  });

  it('monthly and yearly periods', () => {
    expect(periodStart('monthly', '2026-02-17')).toBe('2026-02-01');
    expect(periodEnd('monthly', '2026-02-17')).toBe('2026-02-28');
    expect(periodEnd('monthly', '2028-02-01')).toBe('2028-02-29');
    expect(periodStart('yearly', '2026-10-18')).toBe('2026-01-01');
    expect(periodEnd('yearly', '2026-10-18')).toBe('2026-12-31');
  });
});

describe('dateInTimeZone (ADR-017)', () => {
  const instant = new Date('2026-10-18T23:30:00.000Z');

  it('uses the calendar date of the zone, not of UTC', () => {
    expect(dateInTimeZone(instant, 'UTC')).toBe('2026-10-18');
    expect(dateInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-10-19');
    expect(dateInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-10-18');
    expect(dateInTimeZone(new Date('2026-10-18T03:00:00.000Z'), 'America/Los_Angeles')).toBe(
      '2026-10-17',
    );
  });

  it('follows daylight saving time changes', () => {
    expect(dateInTimeZone(new Date('2026-10-24T22:30:00.000Z'), 'Europe/Berlin')).toBe(
      '2026-10-25',
    );
    expect(dateInTimeZone(new Date('2026-10-25T23:30:00.000Z'), 'Europe/Berlin')).toBe(
      '2026-10-26',
    );
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(dateInTimeZone(instant, 'Not/AZone')).toBe('2026-10-18');
  });
});
