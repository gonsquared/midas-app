import { z } from 'zod';
import { CategoryRefSchema } from './categories.js';
import { BudgetPeriodSchema, BudgetScopeSchema, BudgetStateSchema } from './enums.js';
import { CurrencyCodeSchema } from './locale.js';
import { AmountMinorSchema, LocalDateSchema, SignedAmountMinorSchema } from './money.js';

export const BUDGET_LIMIT = 200;
export const WARNING_THRESHOLD_MIN = 1;
export const WARNING_THRESHOLD_MAX = 99;

const WarningThresholdSchema = z
  .number()
  .int()
  .min(WARNING_THRESHOLD_MIN)
  .max(WARNING_THRESHOLD_MAX);

export const BudgetStatusSchema = z.object({
  periodStart: LocalDateSchema,
  periodEnd: LocalDateSchema,
  spentMinor: z.number().int().min(0),
  remainingMinor: SignedAmountMinorSchema,
  percentUsed: z.number().min(0),
  state: BudgetStateSchema,
});
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const BudgetSchema = z.object({
  id: z.uuid(),
  scope: BudgetScopeSchema,
  category: CategoryRefSchema.nullable(),
  period: BudgetPeriodSchema,
  amountMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
  warningThresholdPct: WarningThresholdSchema,
  startDate: LocalDateSchema,
  status: BudgetStatusSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const BudgetListResponseSchema = z.object({
  date: LocalDateSchema,
  items: z.array(BudgetSchema),
});
export type BudgetListResponse = z.infer<typeof BudgetListResponseSchema>;

export const CreateBudgetRequestSchema = z
  .strictObject({
    scope: BudgetScopeSchema,
    categoryId: z.uuid().optional(),
    period: BudgetPeriodSchema.default('monthly'),
    amountMinor: AmountMinorSchema,
    currency: CurrencyCodeSchema.optional(),
    warningThresholdPct: WarningThresholdSchema.default(80),
    startDate: LocalDateSchema.optional(),
  })
  .check((ctx) => {
    const { scope, categoryId } = ctx.value;
    if (scope === 'category' && categoryId === undefined) {
      ctx.issues.push({
        code: 'custom',
        input: categoryId,
        path: ['categoryId'],
        message: '`categoryId` is required for a category budget.',
        params: { code: 'REQUIRED' },
      });
    }
    if (scope === 'overall' && categoryId !== undefined) {
      ctx.issues.push({
        code: 'custom',
        input: categoryId,
        path: ['categoryId'],
        message: '`categoryId` must be absent for an overall budget.',
        params: { code: 'NOT_ALLOWED' },
      });
    }
  });
export type CreateBudgetRequest = z.infer<typeof CreateBudgetRequestSchema>;

/** Scope, category, period and currency are fixed after creation (api-contract 10). */
export const UpdateBudgetRequestSchema = z.strictObject({
  amountMinor: AmountMinorSchema.optional(),
  warningThresholdPct: WarningThresholdSchema.optional(),
  startDate: LocalDateSchema.optional(),
});
export type UpdateBudgetRequest = z.infer<typeof UpdateBudgetRequestSchema>;

export const BudgetIdParamsSchema = z.strictObject({ budgetId: z.uuid() });
export const BudgetDateQuerySchema = z.strictObject({ date: LocalDateSchema.optional() });
export type BudgetDateQuery = z.infer<typeof BudgetDateQuerySchema>;
