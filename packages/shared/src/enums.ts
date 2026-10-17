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
