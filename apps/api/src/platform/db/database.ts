import type {
  CategoryType,
  Role,
  Theme,
  TransactionType,
  TransferDirection,
  UserStatus,
  WalletType,
} from '@midas/shared';
import type { ColumnType } from 'kysely';
import type {
  Categories as GeneratedCategories,
  DB,
  Generated,
  Timestamp,
  Transactions as GeneratedTransactions,
  Users as GeneratedUsers,
  Wallets as GeneratedWallets,
} from './database.generated.js';

/**
 * Narrows `text` enum columns to the unions exported by `@midas/shared`
 * (database design notes 3.1). The CHECK-vs-enum parity test keeps both in step.
 */
export interface UsersTable extends Omit<
  GeneratedUsers,
  'role' | 'status' | 'theme' | 'createdAt' | 'updatedAt'
> {
  role: Generated<Role>;
  status: Generated<UserStatus>;
  theme: Generated<Theme>;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}

/** Read-only from the application: maintained by the database (generated column or trigger). */
type DatabaseMaintained<T> = ColumnType<T, never, never>;

export interface WalletsTable extends Omit<GeneratedWallets, 'type' | 'ledgerBalanceMinor'> {
  type: WalletType;
  /**
   * Sum of the wallet's `signed_amount_minor`, written only by `tg_transactions__wallet_balance`
   * (DB-ADR-05). The API balance is `openingBalanceMinor + ledgerBalanceMinor`.
   */
  ledgerBalanceMinor: DatabaseMaintained<number>;
}

export interface CategoriesTable extends Omit<GeneratedCategories, 'type' | 'ownerUserId'> {
  /** Immutable after insert: it is the target of the type-matching foreign keys. */
  type: ColumnType<CategoryType, CategoryType, never>;
  /**
   * Null for system categories. Immutable after insert: `tg_categories__owner_immutable` rejects
   * any change (`ck_categories__owner_immutable`), so the type forbids it too.
   */
  ownerUserId: ColumnType<string | null, string | null | undefined, never>;
}

export interface TransactionsTable extends Omit<
  GeneratedTransactions,
  'type' | 'transferDirection' | 'signedAmountMinor'
> {
  type: TransactionType;
  transferDirection: TransferDirection | null;
  /** Stored generated column: +amount for income and transfer `in`, -amount otherwise. */
  signedAmountMinor: DatabaseMaintained<number>;
}

export interface Database extends Omit<DB, 'users' | 'wallets' | 'categories' | 'transactions'> {
  users: UsersTable;
  wallets: WalletsTable;
  categories: CategoriesTable;
  transactions: TransactionsTable;
}
