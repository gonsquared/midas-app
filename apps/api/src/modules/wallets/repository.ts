import type { WalletType } from '@midas/shared';
import { sql } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';

export interface WalletRecord {
  id: string;
  name: string;
  type: WalletType;
  currency: string;
  openingBalanceMinor: number;
  /** Opening balance plus the ledger sum maintained by the database trigger. */
  balanceMinor: number;
  archivedAt: Date | null;
  hasTransactions: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The fields ledger writes need after taking the row lock. */
export interface LockedWallet {
  id: string;
  name: string;
  currency: string;
  archivedAt: Date | null;
}

export interface NewWallet {
  id: string;
  userId: string;
  name: string;
  type: WalletType;
  currency: string;
  openingBalanceMinor: number;
}

export interface WalletPatch {
  name?: string;
  type?: WalletType;
  currency?: string;
  openingBalanceMinor?: number;
}

export function createWalletsRepository(db: DbHandle) {
  const baseSelect = (userId: string) =>
    db
      .selectFrom('wallets')
      .select([
        'wallets.id',
        'wallets.name',
        'wallets.type',
        'wallets.currency',
        'wallets.openingBalanceMinor',
        sql<number>`wallets.opening_balance_minor + wallets.ledger_balance_minor`.as(
          'balanceMinor',
        ),
        'wallets.archivedAt',
        sql<boolean>`exists (select 1 from transactions t where t.wallet_id = wallets.id)`.as(
          'hasTransactions',
        ),
        'wallets.createdAt',
        'wallets.updatedAt',
      ])
      .where('wallets.userId', '=', userId);

  return {
    /** AP-05: at most 100 rows per user, cost independent of transaction volume. */
    async list(userId: string, includeArchived: boolean): Promise<WalletRecord[]> {
      let query = baseSelect(userId);
      if (!includeArchived) query = query.where('wallets.archivedAt', 'is', null);
      return query
        .orderBy(sql`lower(wallets.name)`)
        .orderBy('wallets.id')
        .limit(100)
        .execute();
    },

    async findById(userId: string, id: string): Promise<WalletRecord | null> {
      const row = await baseSelect(userId).where('wallets.id', '=', id).executeTakeFirst();
      return row ?? null;
    },

    async count(userId: string): Promise<number> {
      const row = await db
        .selectFrom('wallets')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow();
      return row.n;
    },

    /**
     * Locks the user wallets among `ids` in id order (database design 8.3 lock ordering), so
     * writers on the same wallets serialize against archive and cannot deadlock each other.
     * Wallets of other users are never returned.
     */
    async lockByIds(userId: string, ids: string[]): Promise<LockedWallet[]> {
      if (ids.length === 0) return [];
      return db
        .selectFrom('wallets')
        .select(['id', 'name', 'currency', 'archivedAt'])
        .where('userId', '=', userId)
        .where('id', 'in', ids)
        .orderBy('id')
        .forNoKeyUpdate()
        .execute();
    },

    async insert(wallet: NewWallet): Promise<void> {
      await db
        .insertInto('wallets')
        .values({
          id: wallet.id,
          userId: wallet.userId,
          name: wallet.name,
          type: wallet.type,
          currency: wallet.currency,
          openingBalanceMinor: wallet.openingBalanceMinor,
        })
        .execute();
    },

    async update(userId: string, id: string, patch: WalletPatch): Promise<void> {
      const values = {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.currency !== undefined && { currency: patch.currency }),
        ...(patch.openingBalanceMinor !== undefined && {
          openingBalanceMinor: patch.openingBalanceMinor,
        }),
      };
      if (Object.keys(values).length === 0) return;
      await db
        .updateTable('wallets')
        .set(values)
        .where('userId', '=', userId)
        .where('id', '=', id)
        .execute();
    },

    async setArchivedAt(userId: string, id: string, archivedAt: Date | null): Promise<void> {
      await db
        .updateTable('wallets')
        .set({ archivedAt })
        .where('userId', '=', userId)
        .where('id', '=', id)
        .execute();
    },

    async delete(userId: string, id: string): Promise<void> {
      await db.deleteFrom('wallets').where('userId', '=', userId).where('id', '=', id).execute();
    },

    /** AP-18 probe; the foreign keys remain the final guard against races. */
    async hasLedgerRows(walletId: string): Promise<boolean> {
      const row = await db
        .selectFrom('transactions')
        .select('id')
        .where('walletId', '=', walletId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}

export type WalletsRepository = ReturnType<typeof createWalletsRepository>;
