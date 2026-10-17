import { describe, expect, it } from 'vitest';
import { AppError } from '../../platform/errors.js';
import { decodeCursor, encodeCursor, filterHash } from './cursor.js';

const ID = '0197f8a0-0000-7000-8000-000000000001';
const key = { primary: '2026-10-05', createdAt: '2026-10-05T10:00:00.123Z', id: ID };

describe('transaction cursor', () => {
  it('round-trips the sort key', () => {
    const cursor = encodeCursor('date_desc', {}, key);
    expect(decodeCursor(cursor, 'date_desc', {})).toEqual(key);
  });

  it('round-trips an amount key for amount sorts', () => {
    const amountKey = { ...key, primary: 1250 };
    const cursor = encodeCursor('amount_asc', { type: ['expense'] }, amountKey);
    expect(decodeCursor(cursor, 'amount_asc', { type: ['expense'] })).toEqual(amountKey);
  });

  it('is bound to the sort and the filters', () => {
    const cursor = encodeCursor('date_desc', { q: 'a' }, key);
    expect(() => decodeCursor(cursor, 'date_asc', { q: 'a' })).toThrow(AppError);
    expect(() => decodeCursor(cursor, 'date_desc', { q: 'b' })).toThrow(AppError);
    expect(() => decodeCursor(cursor, 'date_desc', {})).toThrow(AppError);
  });

  it('ignores the order of repeated filter values', () => {
    expect(filterHash({ walletId: ['a', 'b'] })).toBe(filterHash({ walletId: ['b', 'a'] }));
  });

  it('rejects a date key under an amount sort and the reverse', () => {
    const cursor = encodeCursor('date_desc', {}, key);
    const forged = Buffer.from(
      JSON.stringify({
        v: 1,
        s: 'amount_desc',
        f: filterHash({}),
        k: [key.primary, key.createdAt, ID],
      }),
    ).toString('base64url');
    expect(() => decodeCursor(forged, 'amount_desc', {})).toThrow(AppError);
    expect(() => decodeCursor(cursor, 'amount_desc', {})).toThrow(AppError);
  });

  it.each(['', '!!!', 'e30', 'bm90IGpzb24', '=='])('rejects the malformed cursor %j', (cursor) => {
    try {
      decodeCursor(cursor, 'date_desc', {});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_CURSOR');
    }
  });
});
