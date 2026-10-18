import type { BudgetState } from './enums.js';

/**
 * Budget arithmetic (ADR-012, architecture 2.4). Integer math only: spent and limit can reach
 * 10^14 minor units, so products with 100 or 1000 exceed 2^53 and run through BigInt.
 */

export const DEFAULT_WARNING_THRESHOLD_PCT = 80;

/**
 * - `exceeded` when `spent >= limit` (reaching the limit counts as exceeded)
 * - `warning` when `spent * 100 >= limit * thresholdPct`
 * - `ok` otherwise
 */
export function budgetState(
  spentMinor: number,
  limitMinor: number,
  thresholdPct: number,
): BudgetState {
  const spent = BigInt(spentMinor);
  const limit = BigInt(limitMinor);
  if (spent >= limit) return 'exceeded';
  if (spent * 100n >= limit * BigInt(thresholdPct)) return 'warning';
  return 'ok';
}

/** `spent / limit * 100` rounded half up to one decimal; may exceed 100. */
export function percentUsed(spentMinor: number, limitMinor: number): number {
  const spent = BigInt(spentMinor);
  const limit = BigInt(limitMinor);
  if (limit <= 0n) return 0;
  // tenths of a percent = spent * 1000 / limit, rounded half up
  const tenths = (spent * 2000n + limit) / (2n * limit);
  return Number(tenths) / 10;
}

/**
 * Percentages with two decimals that add up to exactly 100.00 (largest-remainder method,
 * API contract 11). Works in basis points. Returns zeros when the total is not positive.
 */
export function allocatePercentages(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total <= 0n) return values.map(() => 0);
  const exact = values.map((value) => BigInt(value) * 10_000n);
  const floors = exact.map((value) => value / total);
  const remainders = exact.map((value, index) => ({ index, rest: value % total }));
  let missing = 10_000n - floors.reduce((sum, value) => sum + value, 0n);
  remainders.sort((a, b) => (a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1));
  const basisPoints = floors.slice();
  for (const { index } of remainders) {
    if (missing <= 0n) break;
    basisPoints[index] = (basisPoints[index] ?? 0n) + 1n;
    missing -= 1n;
  }
  return basisPoints.map((bp) => Number(bp) / 100);
}
