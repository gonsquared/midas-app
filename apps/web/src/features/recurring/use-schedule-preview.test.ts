import { describe, expect, it } from 'vitest';
import { splitPreview } from './use-schedule-preview';

describe('splitPreview', () => {
  it('counts earlier dates and keeps the first five upcoming ones', () => {
    const dates = ['2026-09-20', '2026-10-01', '2026-10-20', '2026-10-27', '2026-11-03'];
    expect(splitPreview(dates, '2026-10-16')).toEqual({
      earlier: 2,
      next: ['2026-10-20', '2026-10-27', '2026-11-03'],
      earlierCapped: false,
    });
  });

  it('flags a capped catch-up list', () => {
    const dates = Array.from({ length: 24 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const result = splitPreview(dates, '2026-10-16');
    expect(result.earlier).toBe(24);
    expect(result.earlierCapped).toBe(true);
    expect(result.next).toEqual([]);
  });
});
