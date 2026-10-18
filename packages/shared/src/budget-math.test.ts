import { describe, expect, it } from 'vitest';
import { allocatePercentages, budgetState, percentUsed } from './budget-math.js';

describe('budgetState boundaries (E6-F1-S4)', () => {
  it('is ok below the threshold, warning at it, exceeded at the limit', () => {
    expect(budgetState(0, 10_000, 80)).toBe('ok');
    expect(budgetState(7_999, 10_000, 80)).toBe('ok');
    expect(budgetState(8_000, 10_000, 80)).toBe('warning');
    expect(budgetState(9_999, 10_000, 80)).toBe('warning');
    expect(budgetState(10_000, 10_000, 80)).toBe('exceeded');
    expect(budgetState(10_001, 10_000, 80)).toBe('exceeded');
  });

  it('respects a custom threshold from 1 to 99', () => {
    expect(budgetState(1, 100, 1)).toBe('warning');
    expect(budgetState(0, 100, 1)).toBe('ok');
    expect(budgetState(98, 100, 99)).toBe('ok');
    expect(budgetState(99, 100, 99)).toBe('warning');
    expect(budgetState(100, 100, 99)).toBe('exceeded');
  });

  it('uses exact integer math where percentages would round', () => {
    expect(budgetState(7_999, 10_000, 80)).toBe('ok');
    expect(budgetState(2, 3, 67)).toBe('ok');
    expect(budgetState(2, 3, 66)).toBe('warning');
  });

  it('stays exact beyond 2^53 when multiplied', () => {
    const limit = 100_000_000_000_000;
    expect(budgetState(79_999_999_999_999, limit, 80)).toBe('ok');
    expect(budgetState(80_000_000_000_000, limit, 80)).toBe('warning');
    expect(budgetState(limit - 1, limit, 99)).toBe('warning');
    expect(budgetState(limit, limit, 99)).toBe('exceeded');
  });
});

describe('percentUsed', () => {
  it('rounds half up to one decimal and may exceed 100', () => {
    expect(percentUsed(0, 10_000)).toBe(0);
    expect(percentUsed(8_000, 10_000)).toBe(80);
    expect(percentUsed(1, 3)).toBe(33.3);
    expect(percentUsed(2, 3)).toBe(66.7);
    expect(percentUsed(15_000, 10_000)).toBe(150);
    expect(percentUsed(1, 8)).toBe(12.5);
    expect(percentUsed(1, 16)).toBe(6.3);
  });
});

describe('allocatePercentages (largest remainder)', () => {
  it('adds up to exactly 100.00', () => {
    const result = allocatePercentages([1, 1, 1]);
    expect(result).toEqual([33.34, 33.33, 33.33]);
  });

  it('handles a single value, zeros and an empty list', () => {
    expect(allocatePercentages([500])).toEqual([100]);
    expect(allocatePercentages([0, 0])).toEqual([0, 0]);
    expect(allocatePercentages([])).toEqual([]);
    expect(allocatePercentages([300, 0, 100])).toEqual([75, 0, 25]);
  });

  it('is exact for large amounts', () => {
    const result = allocatePercentages([99_999_999_999_999, 1]);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(0);
    const sum = allocatePercentages([7, 11, 13, 17, 19]).reduce((a, b) => a + b * 100, 0);
    expect(Math.round(sum)).toBe(10_000);
  });
});
