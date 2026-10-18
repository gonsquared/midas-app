import type {
  AuditAction,
  AuditTargetType,
  BudgetPeriod,
  BudgetScope,
  CategoryType,
  RecurringFrequency,
  RecurringRunStatus,
  RecurringStatus,
  RecurringType,
  Role,
  Theme,
  TransactionType,
  TransferDirection,
  UserStatus,
  WalletType,
} from '@midas/shared';
import type { ColumnType, InsertType, SelectType } from 'kysely';
import type {
  AuditLogs as GeneratedAuditLogs,
  Budgets as GeneratedBudgets,
  Categories as GeneratedCategories,
  DB,
  Generated,
  JsonObject,
  RecurringRuns as GeneratedRecurringRuns,
  RecurringTemplates as GeneratedRecurringTemplates,
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

export interface BudgetsTable extends Omit<GeneratedBudgets, 'scope' | 'period'> {
  scope: BudgetScope;
  /** Defaults to `monthly`. `startDate` must already be the period start (ck_budgets__start_date_aligned). */
  period: Generated<BudgetPeriod>;
}

export interface RecurringTemplatesTable extends Omit<
  GeneratedRecurringTemplates,
  'type' | 'frequency' | 'status'
> {
  type: RecurringType;
  frequency: RecurringFrequency;
  status: Generated<RecurringStatus>;
}

export interface RecurringRunsTable extends Omit<GeneratedRecurringRuns, 'status'> {
  status: RecurringRunStatus;
}

/** Every column is insert-only: the application never updates audit rows (C-10). */
type AppendOnly<T> = { [K in keyof T]: ColumnType<SelectType<T[K]>, InsertType<T[K]>, never> };

/**
 * `audit_logs` is append-only (C-10): midas_app has SELECT and INSERT only, and
 * `tg_audit_logs__immutable` rejects updates and non-maintenance deletes. The type makes every
 * column non-updatable; the audit repository must not expose update or delete methods.
 */
export type AuditLogsTable = AppendOnly<
  Omit<GeneratedAuditLogs, 'action' | 'targetType' | 'metadata'> & {
    /** Format-checked by ck_audit_logs__action; the list itself is validated by the service. */
    action: AuditAction;
    targetType: AuditTargetType;
    /** Always a JSON object of at most 4 KB (ck_audit_logs__metadata). Never secrets or amounts. */
    metadata: Generated<JsonObject>;
  }
>;

export interface Database extends Omit<
  DB,
  | 'users'
  | 'wallets'
  | 'categories'
  | 'transactions'
  | 'budgets'
  | 'recurringTemplates'
  | 'recurringRuns'
  | 'auditLogs'
> {
  users: UsersTable;
  wallets: WalletsTable;
  categories: CategoriesTable;
  transactions: TransactionsTable;
  budgets: BudgetsTable;
  recurringTemplates: RecurringTemplatesTable;
  recurringRuns: RecurringRunsTable;
  auditLogs: AuditLogsTable;
}
