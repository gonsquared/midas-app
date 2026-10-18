import type { CategoryRef, Transaction, WalletRef } from '@midas/shared';
import type { TransactionRow } from './repository.js';

export function walletRef(input: {
  id: string;
  name: string;
  currency: string;
  archivedAt: Date | null;
}): WalletRef {
  return {
    id: input.id,
    name: input.name,
    currency: input.currency as WalletRef['currency'],
    archived: input.archivedAt !== null,
  };
}

function categoryRef(row: TransactionRow): CategoryRef | null {
  if (
    row.categoryId === null ||
    row.categoryName === null ||
    row.categoryType === null ||
    row.categoryIcon === null ||
    row.categoryColor === null
  ) {
    return null;
  }
  return {
    id: row.categoryId,
    name: row.categoryName,
    type: row.categoryType,
    icon: row.categoryIcon,
    color: row.categoryColor,
    system: row.categoryOwnerId === null,
    retired: row.categoryRetiredAt !== null,
  };
}

export function toTransactionDto(row: TransactionRow): Transaction {
  let transfer: Transaction['transfer'] = null;
  if (
    row.transferId !== null &&
    row.transferDirection !== null &&
    row.counterpartId !== null &&
    row.counterpartAmountMinor !== null &&
    row.counterpartWalletId !== null &&
    row.counterpartWalletName !== null &&
    row.counterpartWalletCurrency !== null
  ) {
    transfer = {
      transferId: row.transferId,
      direction: row.transferDirection,
      counterpartTransactionId: row.counterpartId,
      counterpartWallet: walletRef({
        id: row.counterpartWalletId,
        name: row.counterpartWalletName,
        currency: row.counterpartWalletCurrency,
        archivedAt: row.counterpartWalletArchivedAt,
      }),
      counterpartAmountMinor: row.counterpartAmountMinor,
    };
  }
  return {
    id: row.id,
    type: row.type,
    wallet: walletRef({
      id: row.walletId,
      name: row.walletName,
      currency: row.walletCurrency,
      archivedAt: row.walletArchivedAt,
    }),
    category: categoryRef(row),
    amountMinor: row.amountMinor,
    currency: row.currency as Transaction['currency'],
    occurredOn: row.occurredOn,
    note: row.note,
    transfer,
    // Linked to recurring templates once the recurring tables exist (E8-F1-S1).
    recurringTemplateId: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
