import { z } from 'zod';
import { WalletTypeSchema } from './enums.js';
import { CurrencyCodeSchema } from './locale.js';
import { SignedAmountMinorSchema } from './money.js';
import { booleanQuery } from './query.js';

export const WALLET_NAME_MAX_LENGTH = 60;
export const WALLET_LIMIT = 100;

const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;
export const WalletNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(WALLET_NAME_MAX_LENGTH)
  .refine((value) => !FORBIDDEN_NAME_CHARS.test(value), {
    message: 'Must not contain control or invisible formatting characters.',
  });

export const WalletRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  currency: CurrencyCodeSchema,
  archived: z.boolean(),
});
export type WalletRef = z.infer<typeof WalletRefSchema>;

export const WalletSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: WalletTypeSchema,
  currency: CurrencyCodeSchema,
  openingBalanceMinor: SignedAmountMinorSchema,
  balanceMinor: SignedAmountMinorSchema,
  archived: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  hasTransactions: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const WalletListResponseSchema = z.object({ items: z.array(WalletSchema) });

export const ListWalletsQuerySchema = z.strictObject({
  includeArchived: booleanQuery.default(false),
});

export const CreateWalletRequestSchema = z.strictObject({
  name: WalletNameSchema,
  type: WalletTypeSchema,
  currency: CurrencyCodeSchema.optional(),
  openingBalanceMinor: SignedAmountMinorSchema.default(0),
});
export type CreateWalletRequest = z.infer<typeof CreateWalletRequestSchema>;

export const UpdateWalletRequestSchema = z.strictObject({
  name: WalletNameSchema.optional(),
  type: WalletTypeSchema.optional(),
  currency: CurrencyCodeSchema.optional(),
  openingBalanceMinor: SignedAmountMinorSchema.optional(),
});
export type UpdateWalletRequest = z.infer<typeof UpdateWalletRequestSchema>;

export const WalletIdParamsSchema = z.strictObject({ walletId: z.uuid() });
