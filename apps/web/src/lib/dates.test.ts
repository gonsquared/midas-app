import { describe, expect, it } from 'vitest';
import { addDays, datePresets, formatDayHeading, formatLocalDate, todayLocalDate } from './dates';

describe('todayLocalDate', () => {
  it('uses the calendar day in the given time zone, not UTC', () => {
    const instant = new Date('2026-10-16T23:30:00.000Z');
    expect(todayLocalDate('UTC', instant)).toBe('2026-10-16');
    expect(todayLocalDate('Asia/Tokyo', instant)).toBe('2026-10-17');
    expect(todayLocalDate('America/Los_Angeles', instant)).toBe('2026-10-16');
  });
});

describe('addDays', () => {
  it('moves across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('formatLocalDate and formatDayHeading', () => {
  it('formats without shifting the day by time zone', () => {
    expect(formatLocalDate('2026-10-16', 'en-US', { day: 'numeric', month: 'short' })).toBe(
      'Oct 16',
    );
  });

  it('says Today and Yesterday, otherwise a weekday heading', () => {
    expect(formatDayHeading('2026-10-17', 'en-US', '2026-10-17')).toBe('Today');
    expect(formatDayHeading('2026-10-16', 'en-US', '2026-10-17')).toBe('Yesterday');
    expect(formatDayHeading('2026-10-14', 'en-US', '2026-10-17')).toMatch(/Wed.*Oct.*14/);
    expect(formatDayHeading('2025-10-14', 'en-US', '2026-10-17')).toContain('2025');
  });
});

describe('datePresets', () => {
  it('resolves presets to concrete ranges', () => {
    const presets = datePresets('2026-10-17');
    expect(presets['this-month']).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presets['last-month']).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presets['last-30']).toEqual({ from: '2026-09-18', to: '2026-10-17' });
    expect(presets['last-90']).toEqual({ from: '2026-07-20', to: '2026-10-17' });
    expect(presets['this-year']).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('handles january for last month', () => {
    expect(datePresets('2026-01-05')['last-month']).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
});
