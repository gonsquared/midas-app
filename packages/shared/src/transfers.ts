import { z } from 'zod';
import { AmountMinorSchema, LocalDateSchema, NoteSchema } from './money.js';
import { WalletRefSchema } from './wallets.js';

export const TransferSchema = z.object({
  id: z.uuid(),
  fromWallet: WalletRefSchema,
  toWallet: WalletRefSchema,
  amountMinor: AmountMinorSchema,
  toAmountMinor: AmountMinorSchema,
  occurredOn: LocalDateSchema,
  note: z.string().nullable(),
  outTransactionId: z.uuid(),
  inTransactionId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Transfer = z.infer<typeof TransferSchema>;

export const CreateTransferRequestSchema = z.strictObject({
  fromWalletId: z.uuid(),
  toWalletId: z.uuid(),
  amountMinor: AmountMinorSchema,
  toAmountMinor: AmountMinorSchema.optional(),
  occurredOn: LocalDateSchema,
  note: NoteSchema.nullable().optional(),
});
export type CreateTransferRequest = z.infer<typeof CreateTransferRequestSchema>;

export const UpdateTransferRequestSchema = z.strictObject({
  fromWalletId: z.uuid().optional(),
  toWalletId: z.uuid().optional(),
  amountMinor: AmountMinorSchema.optional(),
  toAmountMinor: AmountMinorSchema.optional(),
  occurredOn: LocalDateSchema.optional(),
  note: NoteSchema.nullable().optional(),
});
export type UpdateTransferRequest = z.infer<typeof UpdateTransferRequestSchema>;

export const TransferIdParamsSchema = z.strictObject({ transferId: z.uuid() });
