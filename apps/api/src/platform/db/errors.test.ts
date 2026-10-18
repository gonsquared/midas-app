import { describe, expect, it } from 'vitest';
import { constraintOf, isCheckViolation, isForeignKeyViolation } from './errors.js';

const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('db'), { code, constraint });

describe('foreign key violation detection', () => {
  it('accepts 23503 (PostgreSQL 17) and 23001 (PostgreSQL 18 restrict_violation)', () => {
    expect(isForeignKeyViolation(pgError('23503', 'fk_transactions__wallet'))).toBe(true);
    expect(isForeignKeyViolation(pgError('23001', 'fk_transactions__wallet'))).toBe(true);
  });

  it('matches by constraint name', () => {
    const error = pgError('23001', 'fk_transactions__wallet');
    expect(isForeignKeyViolation(error, 'fk_transactions__wallet', 'other')).toBe(true);
    expect(isForeignKeyViolation(error, 'fk_something_else')).toBe(false);
  });

  it('ignores other codes and non-database errors', () => {
    expect(isForeignKeyViolation(pgError('23505', 'fk_transactions__wallet'))).toBe(false);
    expect(isForeignKeyViolation(new Error('x'))).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
  });
});

describe('check violation and constraint helpers', () => {
  it('detects 23514 by constraint name', () => {
    expect(
      isCheckViolation(pgError('23514', 'ck_wallets__balance_range'), 'ck_wallets__balance_range'),
    ).toBe(true);
    expect(isCheckViolation(pgError('23514', 'other'), 'ck_wallets__balance_range')).toBe(false);
  });

  it('reads the constraint name only from database errors', () => {
    expect(constraintOf(pgError('23505', 'uq_x'))).toBe('uq_x');
    expect(constraintOf(new Error('x'))).toBeUndefined();
  });
});
