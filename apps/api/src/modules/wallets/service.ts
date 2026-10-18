import {
  WALLET_LIMIT,
  type CreateWalletRequest,
  type UpdateWalletRequest,
  type Wallet,
} from '@midas/shared';
import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Clock } from '../../platform/clock.js';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import {
  isCheckViolation,
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../platform/db/errors.js';
import { LOCK_NAMESPACE, lockUserScope } from '../../platform/db/locks.js';
import { AppError } from '../../platform/errors.js';
import { createWalletsRepository, type WalletRecord } from './repository.js';

export const WALLET_NAME_CONSTRAINT = 'uq_wallets__user_name_active';
export const WALLET_BALANCE_CONSTRAINT = 'ck_wallets__balance_range';
/** Tables whose foreign keys block a wallet delete or currency change (database design 7.12). */
const WALLET_FKS = ['fk_transactions__wallet', 'fk_recurring_templates__wallet'];

export function toWalletDto(wallet: WalletRecord): Wallet {
  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    currency: wallet.currency as Wallet['currency'],
    openingBalanceMinor: wallet.openingBalanceMinor,
    balanceMinor: wallet.balanceMinor,
    archived: wallet.archivedAt !== null,
    archivedAt: wallet.archivedAt ? wallet.archivedAt.toISOString() : null,
    hasTransactions: wallet.hasTransactions,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'The requested resource was not found.');
}

function nameTaken(): AppError {
  return new AppError('WALLET_NAME_TAKEN', 'You already have an active wallet with this name.', {
    errors: [
      { field: 'name', code: 'WALLET_NAME_TAKEN', message: 'This wallet name is already in use.' },
    ],
  });
}

function balanceOutOfRange(): AppError {
  return new AppError('VALIDATION_FAILED', 'The request is invalid.', {
    errors: [
      {
        field: 'openingBalanceMinor',
        code: 'OUT_OF_RANGE',
        message: 'The resulting balance is outside the supported range.',
      },
    ],
  });
}

export interface WalletServiceDeps {
  db: Kysely<Database>;
  clock: Clock;
}

export class WalletService {
  constructor(private readonly deps: WalletServiceDeps) {}

  async list(userId: string, includeArchived: boolean): Promise<Wallet[]> {
    const wallets = await createWalletsRepository(this.deps.db).list(userId, includeArchived);
    return wallets.map(toWalletDto);
  }

  async get(userId: string, walletId: string): Promise<Wallet> {
    const wallet = await createWalletsRepository(this.deps.db).findById(userId, walletId);
    if (!wallet) throw notFound();
    return toWalletDto(wallet);
  }

  async create(
    principal: { userId: string; preferences: { currency: string } },
    input: CreateWalletRequest,
  ): Promise<Wallet> {
    const id = uuidv7();
    try {
      return await withTransaction(this.deps.db, async (trx) => {
        const wallets = createWalletsRepository(trx);
        // The cap is checked under a per-user lock so concurrent creates cannot exceed it.
        await lockUserScope(trx, LOCK_NAMESPACE.walletLimit, principal.userId);
        if ((await wallets.count(principal.userId)) >= WALLET_LIMIT) {
          throw new AppError('LIMIT_REACHED', `You can have at most ${WALLET_LIMIT} wallets.`);
        }
        await wallets.insert({
          id,
          userId: principal.userId,
          name: input.name,
          type: input.type,
          currency: input.currency ?? principal.preferences.currency,
          openingBalanceMinor: input.openingBalanceMinor,
        });
        const created = await wallets.findById(principal.userId, id);
        if (!created) throw new Error('wallet missing after insert');
        return toWalletDto(created);
      });
    } catch (error) {
      throw this.mapError(error, 'write');
    }
  }

  async update(userId: string, walletId: string, input: UpdateWalletRequest): Promise<Wallet> {
    try {
      return await withTransaction(this.deps.db, async (trx) => {
        const wallets = createWalletsRepository(trx);
        const [locked] = await wallets.lockByIds(userId, [walletId]);
        if (!locked) throw notFound();
        if (locked.archivedAt !== null) {
          throw new AppError('WALLET_ARCHIVED', 'Archived wallets cannot be edited.');
        }
        if (input.currency !== undefined && input.currency !== locked.currency) {
          if (await wallets.hasLedgerRows(walletId)) {
            throw new AppError(
              'WALLET_CURRENCY_LOCKED',
              'The currency cannot change once a wallet has transactions.',
            );
          }
        }
        await wallets.update(userId, walletId, input);
        const updated = await wallets.findById(userId, walletId);
        if (!updated) throw notFound();
        return toWalletDto(updated);
      });
    } catch (error) {
      throw this.mapError(error, 'currency');
    }
  }

  /** Idempotent. Recurring templates on the wallet are paused once that table exists (E8). */
  async archive(userId: string, walletId: string): Promise<Wallet> {
    return this.setArchived(userId, walletId, true);
  }

  async unarchive(userId: string, walletId: string): Promise<Wallet> {
    return this.setArchived(userId, walletId, false);
  }

  async remove(userId: string, walletId: string): Promise<void> {
    try {
      await withTransaction(this.deps.db, async (trx) => {
        const wallets = createWalletsRepository(trx);
        const [locked] = await wallets.lockByIds(userId, [walletId]);
        if (!locked) throw notFound();
        if (await wallets.hasLedgerRows(walletId)) throw this.inUse();
        await wallets.delete(userId, walletId);
      });
    } catch (error) {
      throw this.mapError(error, 'delete');
    }
  }

  private async setArchived(userId: string, walletId: string, archive: boolean): Promise<Wallet> {
    try {
      return await withTransaction(this.deps.db, async (trx) => {
        const wallets = createWalletsRepository(trx);
        const [locked] = await wallets.lockByIds(userId, [walletId]);
        if (!locked) throw notFound();
        const isArchived = locked.archivedAt !== null;
        if (isArchived !== archive) {
          await wallets.setArchivedAt(userId, walletId, archive ? this.deps.clock.now() : null);
        }
        const current = await wallets.findById(userId, walletId);
        if (!current) throw notFound();
        return toWalletDto(current);
      });
    } catch (error) {
      throw this.mapError(error, 'write');
    }
  }

  private inUse(): AppError {
    return new AppError(
      'WALLET_IN_USE',
      'This wallet has transactions or recurring templates. Archive it instead.',
    );
  }

  /** Translates database errors by constraint name (database design 7.12). */
  private mapError(error: unknown, operation: 'write' | 'currency' | 'delete'): unknown {
    if (error instanceof AppError) return error;
    if (isUniqueViolation(error, WALLET_NAME_CONSTRAINT)) return nameTaken();
    if (isCheckViolation(error, WALLET_BALANCE_CONSTRAINT)) return balanceOutOfRange();
    if (isForeignKeyViolation(error, ...WALLET_FKS)) {
      if (operation === 'delete') return this.inUse();
      if (operation === 'currency') {
        return new AppError(
          'WALLET_CURRENCY_LOCKED',
          'The currency cannot change once a wallet has transactions.',
        );
      }
    }
    // Unmapped errors surface as a 500; the error handler logs the constraint name only.
    return error;
  }
}
