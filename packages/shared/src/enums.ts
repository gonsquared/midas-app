import { z } from 'zod';

export const ROLES = ['user', 'admin'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const USER_STATUSES = ['active', 'suspended'] as const;
export const UserStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const THEMES = ['light', 'dark', 'system'] as const;
export const ThemeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof ThemeSchema>;

// Ledger enums (API contract 2.1). Each list must equal the matching database CHECK constraint
// (ck_wallets__type, ck_categories__type, ck_transactions__type,
// ck_transactions__transfer_direction); the API enum parity test enforces this.

export const WALLET_TYPES = ['cash', 'bank', 'card', 'savings'] as const;
export const WalletTypeSchema = z.enum(WALLET_TYPES);
export type WalletType = z.infer<typeof WalletTypeSchema>;

export const CATEGORY_TYPES = ['income', 'expense'] as const;
export const CategoryTypeSchema = z.enum(CATEGORY_TYPES);
export type CategoryType = z.infer<typeof CategoryTypeSchema>;

export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
export const TransactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const TRANSFER_DIRECTIONS = ['out', 'in'] as const;
export const TransferDirectionSchema = z.enum(TRANSFER_DIRECTIONS);
export type TransferDirection = z.infer<typeof TransferDirectionSchema>;

// Budget enums (API contract 2.1, ADR-012). Must equal ck_budgets__scope and ck_budgets__period.

export const BUDGET_SCOPES = ['overall', 'category'] as const;
export const BudgetScopeSchema = z.enum(BUDGET_SCOPES);
export type BudgetScope = z.infer<typeof BudgetScopeSchema>;

/** `monthly` is the default (database column default and API default). */
export const BUDGET_PERIODS = ['weekly', 'monthly', 'yearly'] as const;
export const BudgetPeriodSchema = z.enum(BUDGET_PERIODS);
export type BudgetPeriod = z.infer<typeof BudgetPeriodSchema>;

// Recurring enums (API contract 2.1, ADR-011). Must equal ck_recurring_templates__type,
// ck_recurring_templates__frequency, ck_recurring_templates__status and ck_recurring_runs__status.

export const RECURRING_TYPES = ['income', 'expense'] as const;
export const RecurringTypeSchema = z.enum(RECURRING_TYPES);
export type RecurringType = z.infer<typeof RecurringTypeSchema>;

export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export const RecurringFrequencySchema = z.enum(RECURRING_FREQUENCIES);
export type RecurringFrequency = z.infer<typeof RecurringFrequencySchema>;

export const RECURRING_STATUSES = ['active', 'paused', 'ended'] as const;
export const RecurringStatusSchema = z.enum(RECURRING_STATUSES);
export type RecurringStatus = z.infer<typeof RecurringStatusSchema>;

export const RECURRING_RUN_STATUSES = ['succeeded', 'failed', 'skipped'] as const;
export const RecurringRunStatusSchema = z.enum(RECURRING_RUN_STATUSES);
export type RecurringRunStatus = z.infer<typeof RecurringRunStatusSchema>;

// Audit enums (API contract 2.1). AUDIT_TARGET_TYPES must equal ck_audit_logs__target_type.
// AuditAction is validated by the service only; the database checks the format
// (ck_audit_logs__action), so adding an action needs no migration.

export const AUDIT_TARGET_TYPES = ['user', 'session', 'category', 'system'] as const;
export const AuditTargetTypeSchema = z.enum(AUDIT_TARGET_TYPES);
export type AuditTargetType = z.infer<typeof AuditTargetTypeSchema>;

export const AUDIT_ACTIONS = [
  'auth.registered',
  'auth.login_succeeded',
  'auth.login_failed',
  'auth.login_blocked_suspended',
  'auth.logout',
  'auth.session_reuse_detected',
  'auth.password_reset_requested',
  'auth.password_reset_completed',
  'user.password_changed',
  'admin.user_suspended',
  'admin.user_reactivated',
  'admin.user_role_changed',
  'admin.category_created',
  'admin.category_updated',
  'admin.category_retired',
  'admin.category_restored',
  'system.admin_bootstrapped',
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

// Report, budget status and admin enums (API contract 2.1).

export const BUDGET_STATES = ['ok', 'warning', 'exceeded'] as const;
export const BudgetStateSchema = z.enum(BUDGET_STATES);
export type BudgetState = z.infer<typeof BudgetStateSchema>;

export const TREND_GROUP_BY = ['day', 'week', 'month'] as const;
export const TrendGroupBySchema = z.enum(TREND_GROUP_BY);
export type TrendGroupBy = z.infer<typeof TrendGroupBySchema>;

export const ADMIN_USER_SORTS = [
  'createdAt_desc',
  'createdAt_asc',
  'email_asc',
  'lastLoginAt_desc',
] as const;
export const AdminUserSortSchema = z.enum(ADMIN_USER_SORTS);
export type AdminUserSort = z.infer<typeof AdminUserSortSchema>;
