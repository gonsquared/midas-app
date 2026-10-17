import { sql } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';

export interface TransferRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  outTransactionId: string;
  inTransactionId: string;
  fromWalletId: string;
  fromWalletName: string;
  fromWalletCurrency: string;
  fromWalletArchivedAt: Date | null;
  toWalletId: string;
  toWalletName: string;
  toWalletCurrency: string;
  toWalletArchivedAt: Date | null;
  amountMinor: number;
  toAmountMinor: number;
  occurredOn: string;
  note: string | null;
}

export interface LegValues {
  walletId: string;
  currency: string;
  amountMinor: number;
  occurredOn: string;
  note: string | null;
}

export function createTransfersRepository(db: DbHandle) {
  return {
    /** Header plus both legs and their wallets, always scoped by the owner. */
    async findById(userId: string, id: string): Promise<TransferRecord | null> {
      const row = await db
        .selectFrom('transfers as tr')
        .innerJoin('transactions as o', (join) =>
          join.onRef('o.transferId', '=', 'tr.id').on('o.transferDirection', '=', 'out'),
        )
        .innerJoin('transactions as i', (join) =>
          join.onRef('i.transferId', '=', 'tr.id').on('i.transferDirection', '=', 'in'),
        )
        .innerJoin('wallets as ow', 'ow.id', 'o.walletId')
        .innerJoin('wallets as iw', 'iw.id', 'i.walletId')
        .select([
          'tr.id',
          'tr.createdAt',
          'tr.updatedAt',
          'o.id as outTransactionId',
          'i.id as inTransactionId',
          'o.walletId as fromWalletId',
          'ow.name as fromWalletName',
          'ow.currency as fromWalletCurrency',
          'ow.archivedAt as fromWalletArchivedAt',
          'i.walletId as toWalletId',
          'iw.name as toWalletName',
          'iw.currency as toWalletCurrency',
          'iw.archivedAt as toWalletArchivedAt',
          'o.amountMinor as amountMinor',
          'i.amountMinor as toAmountMinor',
          'o.occurredOn as occurredOn',
          'o.note as note',
        ])
        .where('tr.userId', '=', userId)
        .where('tr.id', '=', id)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * Serializes every writer of one transfer, after its wallets are locked (database design
     * 9.2). FOR NO KEY UPDATE: the header is never re-keyed; it is the same lock the deferred
     * pair check takes, so a write and the check of a concurrent write never interleave.
     */
    async lockHeader(userId: string, id: string): Promise<boolean> {
      const row = await db
        .selectFrom('transfers')
        .select('id')
        .where('userId', '=', userId)
        .where('id', '=', id)
        .forNoKeyUpdate()
        .executeTakeFirst();
      return row !== undefined;
    },

    async insertHeader(userId: string, id: string): Promise<void> {
      await db.insertInto('transfers').values({ id, userId }).execute();
    },

    async insertLeg(
      userId: string,
      transferId: string,
      leg: LegValues & { id: string; direction: 'out' | 'in' },
    ): Promise<void> {
      await db
        .insertInto('transactions')
        .values({
          id: leg.id,
          userId,
          walletId: leg.walletId,
          type: 'transfer',
          categoryId: null,
          amountMinor: leg.amountMinor,
          currency: leg.currency,
          occurredOn: leg.occurredOn,
          note: leg.note,
          transferId,
          transferDirection: leg.direction,
        })
        .execute();
    },

    async updateLeg(userId: string, legId: string, leg: LegValues): Promise<void> {
      await db
        .updateTable('transactions')
        .set({
          walletId: leg.walletId,
          currency: leg.currency,
          amountMinor: leg.amountMinor,
          occurredOn: leg.occurredOn,
          note: leg.note,
        })
        .where('userId', '=', userId)
        .where('id', '=', legId)
        .execute();
    },

    async touchHeader(userId: string, id: string): Promise<void> {
      // set_updated_at stamps the same value; the explicit assignment states the intent.
      await db
        .updateTable('transfers')
        .set({ updatedAt: sql`now()` })
        .where('userId', '=', userId)
        .where('id', '=', id)
        .execute();
    },

    /** The legs go with the header (ON DELETE CASCADE), in the same statement. */
    async deleteHeader(userId: string, id: string): Promise<void> {
      await db.deleteFrom('transfers').where('userId', '=', userId).where('id', '=', id).execute();
    },
  };
}

export type TransfersRepository = ReturnType<typeof createTransfersRepository>;
