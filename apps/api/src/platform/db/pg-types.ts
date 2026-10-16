import pg from 'pg';

export class UnsafeIntegerError extends Error {
  constructor(oid: number) {
    super(`Database value outside the safe integer range (type oid ${oid})`);
    this.name = 'UnsafeIntegerError';
  }
}

const INT8 = 20;
const NUMERIC = 1700;
const DATE = 1082;

function parseSafeInteger(oid: number, value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new UnsafeIntegerError(oid);
  return parsed;
}

/**
 * Driver type mapping (database design notes 3.4). Passed to the Pool through its `types` option so
 * nothing is registered globally: bigint and numeric become guarded integers, and `date` stays
 * a `YYYY-MM-DD` string so it can never shift by time zone.
 */
export const pgTypes = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    if (oid === INT8 || oid === NUMERIC) return (value: string) => parseSafeInteger(oid, value);
    if (oid === DATE) return (value: string) => value;
    return pg.types.getTypeParser(oid, format as 'text');
  },
};
