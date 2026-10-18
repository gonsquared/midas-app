import type { Kysely } from 'kysely';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../../platform/db/database.js';
import { AppError } from '../../platform/errors.js';
import {
  LEDGER_MOVE_ATTEMPTS,
  LedgerRowMoved,
  ledgerTransaction,
  mapLedgerError,
} from './errors.js';

const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('db error'), { code, constraint });

function fakeDb(execute: () => Promise<unknown>): Kysely<Database> {
  return { transaction: () => ({ execute }) } as unknown as Kysely<Database>;
}

describe('mapLedgerError', () => {
  it.each([
    ['fk_transactions__wallet', 'walletId'],
    ['fk_category_accessible', 'categoryId'],
    // A vanished category (deleted concurrently) is a reference error, not a type mismatch.
    ['fk_transactions__category', 'categoryId'],
  ])('maps %s to INVALID_REFERENCE on %s', (constraint, field) => {
    const mapped = mapLedgerError(pgError('23503', constraint));
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped).toMatchObject({ code: 'INVALID_REFERENCE', status: 422 });
    expect((mapped as AppError).errors).toEqual([expect.objectContaining({ field })]);
  });

  it('maps the balance range check and passes everything else through', () => {
    expect(mapLedgerError(pgError('23514', 'ck_wallets__balance_range'))).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const pair = pgError('23514', 'ck_transfers__pair');
    expect(mapLedgerError(pair)).toBe(pair);
  });
});

describe('ledgerTransaction', () => {
  it('restarts the whole transaction when the locked row moved, then succeeds', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new LedgerRowMoved())
      .mockRejectedValueOnce(new LedgerRowMoved())
      .mockResolvedValueOnce('done');
    await expect(ledgerTransaction(fakeDb(execute), async () => 'x')).resolves.toBe('done');
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it(`gives up after ${LEDGER_MOVE_ATTEMPTS} attempts`, async () => {
    const execute = vi.fn().mockRejectedValue(new LedgerRowMoved());
    await expect(ledgerTransaction(fakeDb(execute), async () => 'x')).rejects.toBeInstanceOf(
      LedgerRowMoved,
    );
    expect(execute).toHaveBeenCalledTimes(LEDGER_MOVE_ATTEMPTS);
  });

  it('maps constraint errors from the transaction', async () => {
    const execute = vi.fn().mockRejectedValue(pgError('23503', 'fk_transactions__category'));
    await expect(ledgerTransaction(fakeDb(execute), async () => 'x')).rejects.toMatchObject({
      code: 'INVALID_REFERENCE',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
