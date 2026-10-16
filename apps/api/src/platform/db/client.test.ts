import type { Kysely } from 'kysely';
import { describe, expect, it, vi } from 'vitest';
import { sessionOptions, withTransaction } from './client.js';
import type { Database } from './database.js';
import { isPgError, isUniqueViolation } from './errors.js';
import { pgTypes, UnsafeIntegerError } from './pg-types.js';

function fakeDb(execute: (fn: unknown) => Promise<unknown>): Kysely<Database> {
  return { transaction: () => ({ execute }) } as unknown as Kysely<Database>;
}

const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('db error'), { code, constraint });

describe('withTransaction', () => {
  const sleep = vi.fn(async () => undefined);

  it('retries deadlocks and serialization failures, then succeeds', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(pgError('40P01'))
      .mockRejectedValueOnce(pgError('40001'))
      .mockResolvedValueOnce('done');
    await expect(withTransaction(fakeDb(execute), async () => 'x', { sleep })).resolves.toBe(
      'done',
    );
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 retries', async () => {
    const execute = vi.fn().mockRejectedValue(pgError('40P01'));
    await expect(
      withTransaction(fakeDb(execute), async () => 'x', { sleep }),
    ).rejects.toMatchObject({
      code: '40P01',
    });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('does not retry other errors', async () => {
    const execute = vi.fn().mockRejectedValue(pgError('23505', 'uq_users__email'));
    await expect(
      withTransaction(fakeDb(execute), async () => 'x', { sleep }),
    ).rejects.toMatchObject({
      code: '23505',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('pg error helpers', () => {
  it('recognises unique violations by constraint name', () => {
    expect(isUniqueViolation(pgError('23505', 'uq_users__email'), 'uq_users__email')).toBe(true);
    expect(isUniqueViolation(pgError('23505', 'other'), 'uq_users__email')).toBe(false);
    expect(isUniqueViolation(pgError('23503', 'uq_users__email'), 'uq_users__email')).toBe(false);
    expect(isUniqueViolation(new Error('x'), 'uq_users__email')).toBe(false);
    expect(isPgError(null)).toBe(false);
  });
});

describe('pg type parsers', () => {
  const parse = (oid: number, value: string) => pgTypes.getTypeParser(oid)(value);

  it('parses int8 and numeric as guarded integers', () => {
    expect(parse(20, '42')).toBe(42);
    expect(parse(1700, '100')).toBe(100);
    expect(() => parse(20, '9007199254740993')).toThrow(UnsafeIntegerError);
    expect(() => parse(1700, '1.5')).toThrow(UnsafeIntegerError);
  });

  it('keeps date as a plain string and timestamptz as Date', () => {
    expect(parse(1082, '2026-10-16')).toBe('2026-10-16');
    expect(parse(1184, '2026-10-16 08:30:00.123+00')).toBeInstanceOf(Date);
  });
});

describe('sessionOptions', () => {
  it('builds startup options for every session setting', () => {
    expect(sessionOptions(15_000.9)).toBe(
      '-c TimeZone=UTC -c statement_timeout=15000 -c idle_in_transaction_session_timeout=60000 -c lock_timeout=5000',
    );
  });
});
