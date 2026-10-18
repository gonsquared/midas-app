import { z } from 'zod';
import { CategoryRefSchema } from './categories.js';
import { TransactionTypeSchema } from './enums.js';
import { CurrencyCodeSchema } from './locale.js';
import { AmountMinorSchema, LocalDateSchema, NoteSchema } from './money.js';
import { CursorQueryShape, cursorPage } from './pagination.js';
import { integerQuery, repeatable } from './query.js';
import { WalletRefSchema } from './wallets.js';

export const TRANSACTION_SORTS = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const;
export const TransactionSortSchema = z.enum(TRANSACTION_SORTS);
export type TransactionSort = z.infer<typeof TransactionSortSchema>;

export const TransferLegSchema = z.object({
  transferId: z.uuid(),
  direction: z.enum(['out', 'in']),
  counterpartTransactionId: z.uuid(),
  counterpartWallet: WalletRefSchema,
  counterpartAmountMinor: AmountMinorSchema,
});
export type TransferLeg = z.infer<typeof TransferLegSchema>;

export const TransactionSchema = z.object({
  id: z.uuid(),
  type: TransactionTypeSchema,
  wallet: WalletRefSchema,
  category: CategoryRefSchema.nullable(),
  amountMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
  occurredOn: LocalDateSchema,
  note: z.string().nullable(),
  transfer: TransferLegSchema.nullable(),
  recurringTemplateId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionPageSchema = cursorPage(TransactionSchema);
export type TransactionPage = z.infer<typeof TransactionPageSchema>;

export const EditableTransactionTypeSchema = z.enum(['income', 'expense']);

export const CreateTransactionRequestSchema = z.strictObject({
  type: EditableTransactionTypeSchema,
  walletId: z.uuid(),
  categoryId: z.uuid(),
  amountMinor: AmountMinorSchema,
  occurredOn: LocalDateSchema,
  note: NoteSchema.nullable().optional(),
});
export type CreateTransactionRequest = z.infer<typeof CreateTransactionRequestSchema>;

export const UpdateTransactionRequestSchema = z.strictObject({
  type: EditableTransactionTypeSchema.optional(),
  walletId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  amountMinor: AmountMinorSchema.optional(),
  occurredOn: LocalDateSchema.optional(),
  note: NoteSchema.nullable().optional(),
});
export type UpdateTransactionRequest = z.infer<typeof UpdateTransactionRequestSchema>;

export const TransactionIdParamsSchema = z.strictObject({ transactionId: z.uuid() });

export const ListTransactionsQuerySchema = z
  .strictObject({
    from: LocalDateSchema.optional(),
    to: LocalDateSchema.optional(),
    walletId: repeatable(z.uuid()).optional(),
    categoryId: repeatable(z.uuid()).optional(),
    type: repeatable(TransactionTypeSchema, 3).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    minAmountMinor: integerQuery.pipe(AmountMinorSchema).optional(),
    maxAmountMinor: integerQuery.pipe(AmountMinorSchema).optional(),
    sort: TransactionSortSchema.default('date_desc'),
    ...CursorQueryShape,
  })
  .check((ctx) => {
    const { from, to, minAmountMinor, maxAmountMinor } = ctx.value;
    if (from !== undefined && to !== undefined && to < from) {
      ctx.issues.push({
        code: 'custom',
        input: to,
        path: ['to'],
        message: '`to` must not be before `from`.',
        params: { code: 'INVALID_RANGE' },
      });
    }
    if (
      minAmountMinor !== undefined &&
      maxAmountMinor !== undefined &&
      maxAmountMinor < minAmountMinor
    ) {
      ctx.issues.push({
        code: 'custom',
        input: maxAmountMinor,
        path: ['maxAmountMinor'],
        message: '`maxAmountMinor` must not be less than `minAmountMinor`.',
        params: { code: 'INVALID_RANGE' },
      });
    }
  });
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;
