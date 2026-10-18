import type { Transaction as KyselyTransaction, Kysely } from 'kysely';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { isCheckViolation, isForeignKeyViolation } from '../../platform/db/errors.js';
import { AppError } from '../../platform/errors.js';

const invalidReference = (field: 'walletId' | 'categoryId') =>
  new AppError('INVALID_REFERENCE', 'A referenced wallet or category was not found.', {
    errors: [{ field, code: 'INVALID_REFERENCE', message: 'Not found or not accessible.' }],
  });

/**
 * Backstop for races that slip past the service checks (database design 7.12): a category or
 * wallet changed between the check and the write. Unmapped errors pass through as 500s.
 */
export function mapLedgerError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  if (isForeignKeyViolation(error, 'fk_transactions__wallet')) return invalidReference('walletId');
  // The services check the category type before writing (and categories.type is immutable), so a
  // failing category key on a ledger write means the category vanished: a reference error.
  if (isForeignKeyViolation(error, 'fk_category_accessible', 'fk_transactions__category')) {
    return invalidReference('categoryId');
  }
  if (isCheckViolation(error, 'ck_wallets__balance_range')) {
    return new AppError('VALIDATION_FAILED', 'The request is invalid.', {
      errors: [
        {
          field: 'amountMinor',
          code: 'OUT_OF_RANGE',
          message: 'The resulting wallet balance is outside the supported range.',
        },
      ],
    });
  }
  return error;
}

/**
 * Thrown inside a ledger transaction when the row locked last no longer belongs to the wallets
 * locked first (another writer moved it between the unlocked read and the wallet locks; database
 * design 9.2). The transaction rolls back, releasing every lock, and runs again from the start.
 */
export class LedgerRowMoved extends Error {
  constructor() {
    super('ledger row moved to another wallet before it was locked');
    this.name = 'LedgerRowMoved';
  }
}

/** Attempts per request for LedgerRowMoved; each one needs a concurrent move of the same row. */
export const LEDGER_MOVE_ATTEMPTS = 5;

/**
 * `withTransaction` (deadlock and serialization retries) that also restarts on LedgerRowMoved
 * and translates database constraint errors into API errors.
 */
export async function ledgerTransaction<T>(
  db: Kysely<Database>,
  fn: (trx: KyselyTransaction<Database>) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTransaction(db, fn);
    } catch (error) {
      if (error instanceof LedgerRowMoved && attempt < LEDGER_MOVE_ATTEMPTS) continue;
      throw mapLedgerError(error);
    }
  }
}
