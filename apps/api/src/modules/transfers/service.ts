import type { CreateTransferRequest, Transfer, UpdateTransferRequest } from '@midas/shared';
import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Database } from '../../platform/db/database.js';
import { AppError } from '../../platform/errors.js';
import { walletRef } from '../transactions/dto.js';
import { ledgerTransaction, LedgerRowMoved } from '../transactions/errors.js';
import { createWalletsRepository, type LockedWallet } from '../wallets/repository.js';
import {
  createTransfersRepository,
  type TransferRecord,
  type TransfersRepository,
} from './repository.js';

const notFound = () => new AppError('NOT_FOUND', 'The requested resource was not found.');
const walletArchived = () =>
  new AppError('WALLET_ARCHIVED', 'Archived wallets are read-only. Unarchive the wallet first.');
const invalidReference = (field: string) =>
  new AppError('INVALID_REFERENCE', 'A referenced wallet was not found.', {
    errors: [{ field, code: 'INVALID_REFERENCE', message: 'Not found or not accessible.' }],
  });
const sameWallet = () =>
  new AppError('SAME_WALLET_TRANSFER', 'A transfer needs two different wallets.');
const toAmountRequired = () =>
  new AppError(
    'TO_AMOUNT_REQUIRED',
    'The wallets use different currencies. Provide the amount received in toAmountMinor.',
    {
      errors: [
        {
          field: 'toAmountMinor',
          code: 'TO_AMOUNT_REQUIRED',
          message: 'Required across currencies.',
        },
      ],
    },
  );
const toAmountMismatch = () =>
  new AppError(
    'TO_AMOUNT_MISMATCH',
    'For wallets in the same currency, toAmountMinor must equal amountMinor.',
    {
      errors: [
        { field: 'toAmountMinor', code: 'TO_AMOUNT_MISMATCH', message: 'Must equal amountMinor.' },
      ],
    },
  );

export function toTransferDto(record: TransferRecord): Transfer {
  return {
    id: record.id,
    fromWallet: walletRef({
      id: record.fromWalletId,
      name: record.fromWalletName,
      currency: record.fromWalletCurrency,
      archivedAt: record.fromWalletArchivedAt,
    }),
    toWallet: walletRef({
      id: record.toWalletId,
      name: record.toWalletName,
      currency: record.toWalletCurrency,
      archivedAt: record.toWalletArchivedAt,
    }),
    amountMinor: record.amountMinor,
    toAmountMinor: record.toAmountMinor,
    occurredOn: record.occurredOn,
    note: record.note,
    outTransactionId: record.outTransactionId,
    inTransactionId: record.inTransactionId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** ADR-008: same currency needs no toAmount (or an equal one); different currencies need it. */
function resolveToAmount(input: {
  fromCurrency: string;
  toCurrency: string;
  amountMinor: number;
  toAmountMinor: number | undefined;
  /** Used across currencies when the caller did not send toAmountMinor and nothing changed. */
  keep: number | undefined;
}): number {
  if (input.fromCurrency === input.toCurrency) {
    if (input.toAmountMinor !== undefined && input.toAmountMinor !== input.amountMinor) {
      throw toAmountMismatch();
    }
    return input.amountMinor;
  }
  const resolved = input.toAmountMinor ?? input.keep;
  if (resolved === undefined) throw toAmountRequired();
  return resolved;
}

function byId(wallets: LockedWallet[], id: string): LockedWallet | undefined {
  return wallets.find((wallet) => wallet.id === id);
}

/**
 * Locks the header after the wallets and re-reads the transfer. The legs must still be in the
 * wallets that were locked from the unlocked read; otherwise the transaction restarts.
 */
async function lockCurrent(
  transfers: TransfersRepository,
  userId: string,
  id: string,
  seen: TransferRecord,
): Promise<TransferRecord> {
  if (!(await transfers.lockHeader(userId, id))) throw notFound();
  const current = await transfers.findById(userId, id);
  if (!current) throw notFound();
  if (current.fromWalletId !== seen.fromWalletId || current.toWalletId !== seen.toWalletId) {
    throw new LedgerRowMoved();
  }
  return current;
}

export class TransferService {
  constructor(private readonly deps: { db: Kysely<Database> }) {}

  async get(userId: string, id: string): Promise<Transfer> {
    const record = await createTransfersRepository(this.deps.db).findById(userId, id);
    if (!record) throw notFound();
    return toTransferDto(record);
  }

  /**
   * Debits one wallet and credits another atomically (database design C-01): wallets are locked
   * in id order, then the header and both legs are inserted. The deferred pair trigger is the
   * backstop at commit.
   */
  async create(userId: string, input: CreateTransferRequest): Promise<Transfer> {
    if (input.fromWalletId === input.toWalletId) throw sameWallet();
    const id = uuidv7();
    return ledgerTransaction(this.deps.db, async (trx) => {
      const locked = await createWalletsRepository(trx).lockByIds(userId, [
        input.fromWalletId,
        input.toWalletId,
      ]);
      const from = byId(locked, input.fromWalletId);
      const to = byId(locked, input.toWalletId);
      if (!from) throw invalidReference('fromWalletId');
      if (!to) throw invalidReference('toWalletId');
      if (from.archivedAt !== null || to.archivedAt !== null) throw walletArchived();

      const toAmountMinor = resolveToAmount({
        fromCurrency: from.currency,
        toCurrency: to.currency,
        amountMinor: input.amountMinor,
        toAmountMinor: input.toAmountMinor,
        keep: undefined,
      });
      const note = input.note ?? null;
      const transfers = createTransfersRepository(trx);
      await transfers.insertHeader(userId, id);
      await transfers.insertLeg(userId, id, {
        id: uuidv7(),
        direction: 'out',
        walletId: from.id,
        currency: from.currency,
        amountMinor: input.amountMinor,
        occurredOn: input.occurredOn,
        note,
      });
      await transfers.insertLeg(userId, id, {
        id: uuidv7(),
        direction: 'in',
        walletId: to.id,
        currency: to.currency,
        amountMinor: toAmountMinor,
        occurredOn: input.occurredOn,
        note,
      });
      const created = await transfers.findById(userId, id);
      if (!created) throw new Error('transfer missing after insert');
      return toTransferDto(created);
    });
  }

  /**
   * Updates both legs together. Lock order (database design 9.2): read the transfer unlocked,
   * lock every wallet involved (old and new) in id order, then lock the header (FOR NO KEY
   * UPDATE) and re-read the legs. If a concurrent edit moved a leg to another wallet in between,
   * the transaction restarts (LedgerRowMoved). The result is evaluated as a whole: same-wallet
   * and currency rules apply to the resulting state.
   */
  async update(userId: string, id: string, input: UpdateTransferRequest): Promise<Transfer> {
    return ledgerTransaction(this.deps.db, async (trx) => {
      const transfers = createTransfersRepository(trx);
      const seen = await transfers.findById(userId, id);
      if (!seen) throw notFound();

      const fromId = input.fromWalletId ?? seen.fromWalletId;
      const toId = input.toWalletId ?? seen.toWalletId;
      if (fromId === toId) throw sameWallet();

      const locked = await createWalletsRepository(trx).lockByIds(userId, [
        ...new Set([seen.fromWalletId, seen.toWalletId, fromId, toId]),
      ]);
      const from = byId(locked, fromId);
      const to = byId(locked, toId);
      if (!from) throw invalidReference('fromWalletId');
      if (!to) throw invalidReference('toWalletId');
      if (locked.some((wallet) => wallet.archivedAt !== null)) throw walletArchived();

      const current = await lockCurrent(transfers, userId, id, seen);
      const amountMinor = input.amountMinor ?? current.amountMinor;
      const walletsChanged = fromId !== current.fromWalletId || toId !== current.toWalletId;
      const toAmountMinor = resolveToAmount({
        fromCurrency: from.currency,
        toCurrency: to.currency,
        amountMinor,
        toAmountMinor: input.toAmountMinor,
        keep: walletsChanged ? undefined : current.toAmountMinor,
      });
      const occurredOn = input.occurredOn ?? current.occurredOn;
      const note = input.note !== undefined ? input.note : current.note;

      await transfers.updateLeg(userId, current.outTransactionId, {
        walletId: from.id,
        currency: from.currency,
        amountMinor,
        occurredOn,
        note,
      });
      await transfers.updateLeg(userId, current.inTransactionId, {
        walletId: to.id,
        currency: to.currency,
        amountMinor: toAmountMinor,
        occurredOn,
        note,
      });
      await transfers.touchHeader(userId, id);

      const updated = await transfers.findById(userId, id);
      if (!updated) throw notFound();
      return toTransferDto(updated);
    });
  }

  /** Same lock order as update; the legs go with the header (ON DELETE CASCADE). */
  async remove(userId: string, id: string): Promise<void> {
    await ledgerTransaction(this.deps.db, async (trx) => {
      const transfers = createTransfersRepository(trx);
      const seen = await transfers.findById(userId, id);
      if (!seen) throw notFound();
      const locked = await createWalletsRepository(trx).lockByIds(userId, [
        seen.fromWalletId,
        seen.toWalletId,
      ]);
      if (locked.some((wallet) => wallet.archivedAt !== null)) throw walletArchived();
      await lockCurrent(transfers, userId, id, seen);
      await transfers.deleteHeader(userId, id);
    });
  }
}
