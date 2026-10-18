import type {
  CreateTransactionRequest,
  ListTransactionsQuery,
  Transaction,
  TransactionPage,
  UpdateTransactionRequest,
} from '@midas/shared';
import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Database } from '../../platform/db/database.js';
import { AppError } from '../../platform/errors.js';
import { createCategoriesRepository, type CategoryRecord } from '../categories/repository.js';
import { createWalletsRepository } from '../wallets/repository.js';
import { toTransactionDto } from './dto.js';
import { ledgerTransaction, LedgerRowMoved } from './errors.js';
import { listTransactionRows } from './list-query.js';
import {
  createTransactionsRepository,
  type LockedTransaction,
  type TransactionPatch,
} from './repository.js';

const notFound = () => new AppError('NOT_FOUND', 'The requested resource was not found.');
const walletArchived = () =>
  new AppError('WALLET_ARCHIVED', 'Archived wallets are read-only. Unarchive the wallet first.');
const typeMismatch = () =>
  new AppError('CATEGORY_TYPE_MISMATCH', 'The category type does not match the transaction type.');
const invalidReference = (field: string) =>
  new AppError('INVALID_REFERENCE', 'A referenced wallet or category was not found.', {
    errors: [{ field, code: 'INVALID_REFERENCE', message: 'Not found or not accessible.' }],
  });

function assertUsableCategory(
  category: CategoryRecord,
  type: 'income' | 'expense',
  rejectRetired: boolean,
): void {
  if (category.type !== type) throw typeMismatch();
  if (rejectRetired && category.retiredAt !== null) {
    throw new AppError('CATEGORY_RETIRED', 'Retired categories cannot be selected.');
  }
}

function assertNotTransferLeg(row: LockedTransaction, verb: 'edited' | 'deleted'): void {
  if (row.transferId !== null || row.type === 'transfer') {
    throw new AppError(
      'TRANSFER_LEG_IMMUTABLE',
      `Transfer legs cannot be ${verb} here. Use the transfer endpoints.`,
    );
  }
}

export class TransactionService {
  constructor(private readonly deps: { db: Kysely<Database> }) {}

  async list(userId: string, query: ListTransactionsQuery): Promise<TransactionPage> {
    const { rows, nextCursor } = await listTransactionRows(this.deps.db, userId, query);
    return { items: rows.map(toTransactionDto), nextCursor };
  }

  async get(userId: string, id: string): Promise<Transaction> {
    const row = await createTransactionsRepository(this.deps.db).findById(userId, id);
    if (!row) throw notFound();
    return toTransactionDto(row);
  }

  /**
   * Lock order (database design 9.2): the wallet, then the category (key share, as the foreign
   * key check would), then the insert. Holding the wallet lock serializes the archived check
   * with archive and currency changes; the category lock makes a concurrent category delete
   * finish first, so the category is then reported missing instead of failing at the insert.
   * The balance trigger updates the wallet in the same transaction.
   */
  async create(userId: string, input: CreateTransactionRequest): Promise<Transaction> {
    const id = uuidv7();
    return ledgerTransaction(this.deps.db, async (trx) => {
      const [wallet] = await createWalletsRepository(trx).lockByIds(userId, [input.walletId]);
      if (!wallet) throw invalidReference('walletId');
      const category = await createCategoriesRepository(trx).shareAccessible(
        userId,
        input.categoryId,
      );
      if (!category) throw invalidReference('categoryId');
      if (wallet.archivedAt !== null) throw walletArchived();
      assertUsableCategory(category, input.type, true);

      const transactions = createTransactionsRepository(trx);
      await transactions.insert({
        id,
        userId,
        walletId: wallet.id,
        type: input.type,
        categoryId: category.id,
        amountMinor: input.amountMinor,
        currency: wallet.currency,
        occurredOn: input.occurredOn,
        note: input.note ?? null,
      });
      const created = await transactions.findById(userId, id);
      if (!created) throw new Error('transaction missing after insert');
      return toTransactionDto(created);
    });
  }

  /**
   * Edits an income or expense. Lock order (database design 9.2): read the row unlocked to learn
   * its wallet, lock the source and target wallets in id order, take a key-share lock on a new
   * category, and only then lock the row (FOR NO KEY UPDATE). If another writer moved the row to
   * a different wallet in between, the transaction restarts (LedgerRowMoved). Every path takes
   * wallets before categories before ledger rows, so no lock cycle can form with category
   * delete-and-reassign (categories, then ledger rows) or with create (wallet, then category).
   * Balances follow from the database trigger in the same transaction.
   */
  async update(userId: string, id: string, input: UpdateTransactionRequest): Promise<Transaction> {
    return ledgerTransaction(this.deps.db, async (trx) => {
      const transactions = createTransactionsRepository(trx);
      const seen = await transactions.findLedgerRow(userId, id);
      if (!seen) throw notFound();
      assertNotTransferLeg(seen, 'edited');

      const targetWalletId = input.walletId ?? seen.walletId;
      const locked = await createWalletsRepository(trx).lockByIds(userId, [
        ...new Set([seen.walletId, targetWalletId]),
      ]);
      const source = locked.find((w) => w.id === seen.walletId);
      const target = locked.find((w) => w.id === targetWalletId);
      if (!source) throw notFound();
      if (!target) throw invalidReference('walletId');
      if (source.archivedAt !== null || target.archivedAt !== null) throw walletArchived();

      const category =
        input.categoryId === undefined
          ? undefined
          : await createCategoriesRepository(trx).shareAccessible(userId, input.categoryId);
      if (category === null) throw invalidReference('categoryId');

      const current = await transactions.lockById(userId, id);
      if (!current) throw notFound();
      if (current.walletId !== seen.walletId) throw new LedgerRowMoved();
      assertNotTransferLeg(current, 'edited');

      const newType = input.type ?? current.type;
      const typeChanged = newType !== current.type;
      const patch: TransactionPatch = {};

      if (typeChanged || category !== undefined) {
        // A type change needs a category of the new type; the current one has the old type.
        if (category === undefined) throw typeMismatch();
        const changesCategory = category.id !== current.categoryId;
        assertUsableCategory(category, newType as 'income' | 'expense', changesCategory);
        patch.categoryId = category.id;
      }
      if (typeChanged) patch.type = newType as 'income' | 'expense';
      if (targetWalletId !== current.walletId) {
        patch.walletId = target.id;
        patch.currency = target.currency;
      }
      if (input.amountMinor !== undefined) patch.amountMinor = input.amountMinor;
      if (input.occurredOn !== undefined) patch.occurredOn = input.occurredOn;
      if (input.note !== undefined) patch.note = input.note;

      await transactions.update(userId, id, patch);
      const updated = await transactions.findById(userId, id);
      if (!updated) throw notFound();
      return toTransactionDto(updated);
    });
  }

  /** Same lock order as update: unlocked read, wallet lock, row lock with a wallet re-check. */
  async remove(userId: string, id: string): Promise<void> {
    await ledgerTransaction(this.deps.db, async (trx) => {
      const transactions = createTransactionsRepository(trx);
      const seen = await transactions.findLedgerRow(userId, id);
      if (!seen) throw notFound();
      assertNotTransferLeg(seen, 'deleted');
      const [wallet] = await createWalletsRepository(trx).lockByIds(userId, [seen.walletId]);
      if (!wallet) throw notFound();
      if (wallet.archivedAt !== null) throw walletArchived();
      const current = await transactions.lockById(userId, id);
      if (!current) throw notFound();
      if (current.walletId !== seen.walletId) throw new LedgerRowMoved();
      await transactions.delete(userId, id);
    });
  }
}
