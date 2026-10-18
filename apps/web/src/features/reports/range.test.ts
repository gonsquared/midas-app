import { describe, expect, it } from 'vitest';
import {
  canStepMonth,
  parseRangeSearch,
  rangeLabel,
  rangeToSearch,
  resolveRange,
  stepMonth,
} from './range';

const TODAY = '2026-10-16';

describe('parseRangeSearch', () => {
  it('keeps a valid custom pair and a known preset, drops everything else', () => {
    expect(parseRangeSearch({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(parseRangeSearch({ range: 'last-30' })).toEqual({ range: 'last-30' });
    expect(parseRangeSearch({ range: 'this-month' })).toEqual({});
    expect(parseRangeSearch({ range: 'forever' })).toEqual({});
    expect(parseRangeSearch({ from: '2026-09-30', to: '2026-09-01' })).toEqual({});
    expect(parseRangeSearch({ from: '2026-02-30', to: '2026-03-01' })).toEqual({});
  });

  it('rejects a range longer than the 1830 day report limit', () => {
    expect(parseRangeSearch({ from: '2020-01-01', to: '2026-01-01' })).toEqual({});
    expect(parseRangeSearch({ from: '2021-10-17', to: '2026-10-16' })).toEqual({
      from: '2021-10-17',
      to: '2026-10-16',
    });
  });
});

describe('resolveRange and rangeToSearch', () => {
  it('defaults to this month and resolves presets relative to today', () => {
    expect(resolveRange({}, TODAY)).toEqual({
      range: { from: '2026-10-01', to: '2026-10-31' },
      kind: 'this-month',
    });
    expect(resolveRange({ range: 'last-30' }, TODAY).range).toEqual({
      from: '2026-09-17',
      to: '2026-10-16',
    });
    expect(resolveRange({ from: '2026-01-01', to: '2026-03-31' }, TODAY).kind).toBe('custom');
  });

  it('writes the shortest URL form', () => {
    expect(rangeToSearch({ from: '2026-10-01', to: '2026-10-31' }, TODAY)).toEqual({});
    expect(rangeToSearch({ from: '2026-09-17', to: '2026-10-16' }, TODAY)).toEqual({
      range: 'last-30',
    });
    expect(rangeToSearch({ from: '2026-08-01', to: '2026-08-31' }, TODAY)).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });
});

describe('month stepping and labels', () => {
  it('steps whole months only', () => {
    expect(canStepMonth({ from: '2026-10-01', to: '2026-10-31' })).toBe(true);
    expect(canStepMonth({ from: '2026-09-17', to: '2026-10-16' })).toBe(false);
    expect(stepMonth({ from: '2026-10-01', to: '2026-10-31' }, -1)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(stepMonth({ from: '2026-12-01', to: '2026-12-31' }, 1)).toEqual({
      from: '2027-01-01',
      to: '2027-01-31',
    });
  });

  it('labels a month by name and other ranges by their ends', () => {
    expect(rangeLabel({ from: '2026-10-01', to: '2026-10-31' }, 'en-US')).toBe('October 2026');
    expect(rangeLabel({ from: '2026-09-17', to: '2026-10-16' }, 'en-US')).toBe(
      'Sep 17 to Oct 16, 2026',
    );
    expect(rangeLabel({ from: '2025-12-20', to: '2026-01-10' }, 'en-US')).toBe(
      'Dec 20, 2025 to Jan 10, 2026',
    );
  });
});
