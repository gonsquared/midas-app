import { z } from 'zod';
import { BudgetSchema } from './budgets.js';
import { CategoryRefSchema } from './categories.js';
import { CategoryTypeSchema, TrendGroupBySchema } from './enums.js';
import { CurrencyCodeSchema } from './locale.js';
import { LocalDateSchema, SignedAmountMinorSchema } from './money.js';
import { integerQuery } from './query.js';
import { TransactionSchema } from './transactions.js';
import { WalletSchema } from './wallets.js';

/** Longest range the summary and breakdown reports accept (api-contract 11). */
export const REPORT_MAX_RANGE_DAYS = 1830;
/** Most buckets one trend response may contain. */
export const TREND_MAX_BUCKETS = 400;
export const BREAKDOWN_TOP_DEFAULT = 8;
export const BREAKDOWN_TOP_MAX = 20;
export const SUMMARY_RECENT_LIMIT = 10;

interface RangeContext {
  value: { from?: string | undefined; to?: string | undefined };
  issues: Array<z.core.$ZodRawIssue>;
}

function checkRange(ctx: RangeContext): void {
  const { from, to } = ctx.value;
  if (from !== undefined && to !== undefined && to < from) {
    ctx.issues.push({
      code: 'custom',
      input: to,
      path: ['to'],
      message: '`to` must not be before `from`.',
      params: { code: 'INVALID_RANGE' },
    });
  }
}

export const SummaryQuerySchema = z
  .strictObject({ from: LocalDateSchema.optional(), to: LocalDateSchema.optional() })
  .check((ctx) => checkRange(ctx));
export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;

export const TrendQuerySchema = z
  .strictObject({
    from: LocalDateSchema.optional(),
    to: LocalDateSchema.optional(),
    groupBy: TrendGroupBySchema.optional(),
    currency: CurrencyCodeSchema.optional(),
  })
  .check((ctx) => checkRange(ctx));
export type TrendQuery = z.infer<typeof TrendQuerySchema>;

export const CategoryBreakdownQuerySchema = z
  .strictObject({
    from: LocalDateSchema.optional(),
    to: LocalDateSchema.optional(),
    type: CategoryTypeSchema.default('expense'),
    currency: CurrencyCodeSchema.optional(),
    top: integerQuery
      .pipe(z.number().int().min(1).max(BREAKDOWN_TOP_MAX))
      .default(BREAKDOWN_TOP_DEFAULT),
  })
  .check((ctx) => checkRange(ctx));
export type CategoryBreakdownQuery = z.infer<typeof CategoryBreakdownQuerySchema>;

export const CurrencyTotalsSchema = z.object({
  currency: CurrencyCodeSchema,
  balanceMinor: SignedAmountMinorSchema,
  incomeMinor: z.number().int().min(0),
  expenseMinor: z.number().int().min(0),
  netMinor: SignedAmountMinorSchema,
});
export type CurrencyTotals = z.infer<typeof CurrencyTotalsSchema>;

export const ReportSummarySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  wallets: z.array(WalletSchema),
  totalsByCurrency: z.array(CurrencyTotalsSchema),
  recentTransactions: z.array(TransactionSchema),
  budgets: z.array(BudgetSchema),
});
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

export const TrendBucketSchema = z.object({
  periodStart: LocalDateSchema,
  periodEnd: LocalDateSchema,
  incomeMinor: z.number().int().min(0),
  expenseMinor: z.number().int().min(0),
  netMinor: SignedAmountMinorSchema,
});
export type TrendBucket = z.infer<typeof TrendBucketSchema>;

export const ReportTrendSchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  groupBy: TrendGroupBySchema,
  currency: CurrencyCodeSchema,
  buckets: z.array(TrendBucketSchema),
});
export type ReportTrend = z.infer<typeof ReportTrendSchema>;

export const ReportCategoryBreakdownSchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  type: CategoryTypeSchema,
  currency: CurrencyCodeSchema,
  totalMinor: z.number().int().min(0),
  items: z.array(
    z.object({
      category: CategoryRefSchema,
      amountMinor: z.number().int().min(0),
      percentage: z.number(),
      transactionCount: z.number().int().min(0),
    }),
  ),
  other: z
    .object({
      amountMinor: z.number().int().min(0),
      percentage: z.number(),
      categoryCount: z.number().int().min(0),
    })
    .nullable(),
});
export type ReportCategoryBreakdown = z.infer<typeof ReportCategoryBreakdownSchema>;
