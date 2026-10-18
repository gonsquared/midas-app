import type { CategoryType, TransactionType, TransferDirection } from '@midas/shared';
import type { DbHandle } from '../../platform/db/client.js';

export interface TransactionRow {
  id: string;
  type: TransactionType;
  walletId: string;
  walletName: string;
  walletCurrency: string;
  walletArchivedAt: Date | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryType: CategoryType | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  categoryOwnerId: string | null;
  categoryRetiredAt: Date | null;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  note: string | null;
  transferId: string | null;
  transferDirection: TransferDirection | null;
  recurringTemplateId: string | null;
  counterpartId: string | null;
  counterpartAmountMinor: number | null;
  counterpartWalletId: string | null;
  counterpartWalletName: string | null;
  counterpartWalletCurrency: string | null;
  counterpartWalletArchivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The ledger row as stored, read before or under the row lock of a write. */
export interface LockedTransaction {
  id: string;
  type: TransactionType;
  walletId: string;
  categoryId: string | null;
  transferId: string | null;
}

export interface TransactionPatch {
  type?: 'income' | 'expense';
  walletId?: string;
  currency?: string;
  categoryId?: string;
  amountMinor?: number;
  occurredOn?: string;
  note?: string | null;
}

/**
 * Transaction rows joined with wallet, category and (for transfer legs) the counterpart leg and
 * its wallet. Always scoped by user_id; the joins are by primary key or by the unique leg index.
 */
export function selectTransactionRows(db: DbHandle, userId: string) {
  return db
    .selectFrom('transactions as t')
    .innerJoin('wallets as w', 'w.id', 't.walletId')
    .leftJoin('categories as c', 'c.id', 't.categoryId')
    .leftJoin('transactions as o', (join) =>
      join.onRef('o.transferId', '=', 't.transferId').onRef('o.id', '<>', 't.id'),
    )
    .leftJoin('wallets as ow', 'ow.id', 'o.walletId')
    .select([
      't.id',
      't.type',
      't.walletId',
      'w.name as walletName',
      'w.currency as walletCurrency',
      'w.archivedAt as walletArchivedAt',
      't.categoryId',
      'c.name as categoryName',
      'c.type as categoryType',
      'c.icon as categoryIcon',
      'c.color as categoryColor',
      'c.ownerUserId as categoryOwnerId',
      'c.retiredAt as categoryRetiredAt',
      't.amountMinor',
      't.currency',
      't.occurredOn',
      't.note',
      't.transferId',
      't.transferDirection',
      't.recurringTemplateId',
      'o.id as counterpartId',
      'o.amountMinor as counterpartAmountMinor',
      'o.walletId as counterpartWalletId',
      'ow.name as counterpartWalletName',
      'ow.currency as counterpartWalletCurrency',
      'ow.archivedAt as counterpartWalletArchivedAt',
      't.createdAt',
      't.updatedAt',
    ])
    .where('t.userId', '=', userId);
}

export function createTransactionsRepository(db: DbHandle) {
  return {
    async findById(userId: string, id: string): Promise<TransactionRow | null> {
      const row = await selectTransactionRows(db, userId).where('t.id', '=', id).executeTakeFirst();
      return row ?? null;
    },

    /**
     * Unlocked read of the stored row: tells a writer which wallets to lock before it locks the
     * row itself (database design 9.2).
     */
    async findLedgerRow(userId: string, id: string): Promise<LockedTransaction | null> {
      const row = await db
        .selectFrom('transactions')
        .select(['id', 'type', 'walletId', 'categoryId', 'transferId'])
        .where('userId', '=', userId)
        .where('id', '=', id)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * Locks the ledger row after its wallets (database design 9.2). FOR NO KEY UPDATE: the row is
     * never re-keyed, so nothing that only needs a key-share lock is blocked.
     */
    async lockById(userId: string, id: string): Promise<LockedTransaction | null> {
      const row = await db
        .selectFrom('transactions')
        .select(['id', 'type', 'walletId', 'categoryId', 'transferId'])
        .where('userId', '=', userId)
        .where('id', '=', id)
        .forNoKeyUpdate()
        .executeTakeFirst();
      return row ?? null;
    },

    async insert(input: {
      id: string;
      userId: string;
      walletId: string;
      type: 'income' | 'expense';
      categoryId: string;
      amountMinor: number;
      currency: string;
      occurredOn: string;
      note: string | null;
    }): Promise<void> {
      await db.insertInto('transactions').values(input).execute();
    },

    async update(userId: string, id: string, patch: TransactionPatch): Promise<void> {
      const values = {
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.walletId !== undefined && { walletId: patch.walletId }),
        ...(patch.currency !== undefined && { currency: patch.currency }),
        ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
        ...(patch.amountMinor !== undefined && { amountMinor: patch.amountMinor }),
        ...(patch.occurredOn !== undefined && { occurredOn: patch.occurredOn }),
        ...(patch.note !== undefined && { note: patch.note }),
      };
      if (Object.keys(values).length === 0) return;
      await db
        .updateTable('transactions')
        .set(values)
        .where('userId', '=', userId)
        .where('id', '=', id)
        .execute();
    },

    async delete(userId: string, id: string): Promise<void> {
      await db
        .deleteFrom('transactions')
        .where('userId', '=', userId)
        .where('id', '=', id)
        .execute();
    },
  };
}

/** Escapes LIKE metacharacters so user text is matched literally (database design 7.8). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
