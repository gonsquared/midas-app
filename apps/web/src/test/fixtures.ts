import type { Category, Transaction, Wallet } from '@midas/shared';

let counter = 0;

/** Deterministic, valid v4-shaped UUIDs for fixtures. */
export function uuid(n?: number): string {
  const value = n ?? ++counter;
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

const STAMP = '2026-10-01T00:00:00.000Z';

export function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: uuid(),
    name: 'Checking',
    type: 'bank',
    currency: 'USD',
    openingBalanceMinor: 100000,
    balanceMinor: 118000,
    archived: false,
    archivedAt: null,
    hasTransactions: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: uuid(),
    name: 'Groceries',
    type: 'expense',
    icon: 'shopping-cart',
    color: 'green',
    system: true,
    retired: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const wallet = overrides.wallet ?? makeWallet();
  return {
    id: uuid(),
    type: 'expense',
    wallet: {
      id: wallet.id,
      name: wallet.name,
      currency: wallet.currency,
      archived: wallet.archived,
    },
    category: null,
    amountMinor: 5420,
    currency: wallet.currency,
    occurredOn: '2026-10-16',
    note: null,
    transfer: null,
    recurringTemplateId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function resetFixtureIds(): void {
  counter = 0;
}
