import { describe, expect, it } from 'vitest';
import { bucketShells } from './service.js';

describe('bucketShells (E7-F1-S2)', () => {
  it('returns one bucket per day for a day grouping, empty days included', () => {
    const buckets = bucketShells('day', '2026-10-01', '2026-10-03');
    expect(buckets.map((b) => [b.periodStart, b.periodEnd])).toEqual([
      ['2026-10-01', '2026-10-01'],
      ['2026-10-02', '2026-10-02'],
      ['2026-10-03', '2026-10-03'],
    ]);
  });

  it('starts weeks on Monday and clamps the first and last bucket to the range', () => {
    // Wed 2026-10-14 to Tue 2026-10-27
    const buckets = bucketShells('week', '2026-10-14', '2026-10-27');
    expect(buckets.map((b) => [b.key, b.periodStart, b.periodEnd])).toEqual([
      ['2026-10-12', '2026-10-14', '2026-10-18'],
      ['2026-10-19', '2026-10-19', '2026-10-25'],
      ['2026-10-26', '2026-10-26', '2026-10-27'],
    ]);
  });

  it('groups by calendar month across a year boundary', () => {
    const buckets = bucketShells('month', '2026-11-15', '2027-01-10');
    expect(buckets.map((b) => [b.key, b.periodStart, b.periodEnd])).toEqual([
      ['2026-11-01', '2026-11-15', '2026-11-30'],
      ['2026-12-01', '2026-12-01', '2026-12-31'],
      ['2027-01-01', '2027-01-01', '2027-01-10'],
    ]);
  });

  it('accepts exactly 400 buckets and rejects the 401st', () => {
    expect(bucketShells('day', '2026-01-01', '2027-02-04')).toHaveLength(400);
    expect(() => bucketShells('day', '2026-01-01', '2027-02-05')).toThrow(
      expect.objectContaining({ code: 'RANGE_TOO_LARGE', status: 400 }),
    );
  });

  it('handles a single-day range', () => {
    expect(bucketShells('month', '2026-02-10', '2026-02-10')).toEqual([
      { key: '2026-02-01', periodStart: '2026-02-10', periodEnd: '2026-02-10' },
    ]);
  });
});
