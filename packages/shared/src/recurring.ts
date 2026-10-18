import { z } from 'zod';
import { CategoryRefSchema } from './categories.js';
import {
  RecurringFrequencySchema,
  RecurringRunStatusSchema,
  RecurringStatusSchema,
  RecurringTypeSchema,
} from './enums.js';
import { CurrencyCodeSchema } from './locale.js';
import { AmountMinorSchema, LocalDateSchema, NoteSchema } from './money.js';
import { CursorQueryShape, cursorPage } from './pagination.js';
import { WalletRefSchema } from './wallets.js';

export const RECURRING_LIMIT = 200;
export const RECURRING_NAME_MAX_LENGTH = 60;
export const RECURRING_INTERVAL_MAX = 99;
/** A template may start at most this many days in the past (architecture 2.4). */
export const RECURRING_MAX_BACKDATE_DAYS = 31;
export const PREVIEW_COUNT_DEFAULT = 5;
export const PREVIEW_COUNT_MAX = 24;

const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;
export const RecurringNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(RECURRING_NAME_MAX_LENGTH)
  .refine((value) => !FORBIDDEN_NAME_CHARS.test(value), {
    message: 'Must not contain control or invisible formatting characters.',
  });

const IntervalSchema = z.number().int().min(1).max(RECURRING_INTERVAL_MAX);

export const RecurringTemplateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: RecurringTypeSchema,
  wallet: WalletRefSchema,
  category: CategoryRefSchema,
  amountMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
  note: z.string().nullable(),
  frequency: RecurringFrequencySchema,
  interval: IntervalSchema,
  startDate: LocalDateSchema,
  endDate: LocalDateSchema.nullable(),
  nextRunOn: LocalDateSchema.nullable(),
  status: RecurringStatusSchema,
  lastRunAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type RecurringTemplate = z.infer<typeof RecurringTemplateSchema>;

export const RecurringTemplateListSchema = z.object({ items: z.array(RecurringTemplateSchema) });

export const RecurringRunSchema = z.object({
  id: z.uuid(),
  templateId: z.uuid(),
  occurrenceDate: LocalDateSchema,
  status: RecurringRunStatusSchema,
  transactionId: z.uuid().nullable(),
  errorCode: z.string().nullable(),
  attempts: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type RecurringRun = z.infer<typeof RecurringRunSchema>;

export const RecurringRunPageSchema = cursorPage(RecurringRunSchema);
export type RecurringRunPage = z.infer<typeof RecurringRunPageSchema>;

interface EndAfterStartContext {
  value: { startDate?: string | undefined; endDate?: string | null | undefined };
  issues: Array<z.core.$ZodRawIssue>;
}

function checkEndAfterStart(ctx: EndAfterStartContext): void {
  const { startDate, endDate } = ctx.value;
  if (startDate !== undefined && endDate !== undefined && endDate !== null && endDate < startDate) {
    ctx.issues.push({
      code: 'custom',
      input: endDate,
      path: ['endDate'],
      message: '`endDate` must not be before `startDate`.',
      params: { code: 'INVALID_RANGE' },
    });
  }
}

export const ListRecurringQuerySchema = z.strictObject({
  status: RecurringStatusSchema.optional(),
});
export type ListRecurringQuery = z.infer<typeof ListRecurringQuerySchema>;

export const CreateRecurringTemplateRequestSchema = z
  .strictObject({
    name: RecurringNameSchema,
    type: RecurringTypeSchema,
    walletId: z.uuid(),
    categoryId: z.uuid(),
    amountMinor: AmountMinorSchema,
    note: NoteSchema.nullable().optional(),
    frequency: RecurringFrequencySchema,
    interval: IntervalSchema.default(1),
    startDate: LocalDateSchema,
    endDate: LocalDateSchema.nullable().optional(),
  })
  .check((ctx) => checkEndAfterStart(ctx));
export type CreateRecurringTemplateRequest = z.infer<typeof CreateRecurringTemplateRequestSchema>;

/** `type` cannot be changed (api-contract 12). */
export const UpdateRecurringTemplateRequestSchema = z
  .strictObject({
    name: RecurringNameSchema.optional(),
    walletId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    amountMinor: AmountMinorSchema.optional(),
    note: NoteSchema.nullable().optional(),
    frequency: RecurringFrequencySchema.optional(),
    interval: IntervalSchema.optional(),
    startDate: LocalDateSchema.optional(),
    endDate: LocalDateSchema.nullable().optional(),
  })
  .check((ctx) => checkEndAfterStart(ctx));
export type UpdateRecurringTemplateRequest = z.infer<typeof UpdateRecurringTemplateRequestSchema>;

export const PreviewRecurringRequestSchema = z
  .strictObject({
    frequency: RecurringFrequencySchema,
    interval: IntervalSchema.default(1),
    startDate: LocalDateSchema,
    endDate: LocalDateSchema.nullable().optional(),
    fromDate: LocalDateSchema.optional(),
    count: z.number().int().min(1).max(PREVIEW_COUNT_MAX).default(PREVIEW_COUNT_DEFAULT),
  })
  .check((ctx) => checkEndAfterStart(ctx));
export type PreviewRecurringRequest = z.infer<typeof PreviewRecurringRequestSchema>;

export const PreviewRecurringResponseSchema = z.object({ dates: z.array(LocalDateSchema) });
export type PreviewRecurringResponse = z.infer<typeof PreviewRecurringResponseSchema>;

export const TemplateIdParamsSchema = z.strictObject({ templateId: z.uuid() });
export const ListRunsQuerySchema = z.strictObject(CursorQueryShape);
export type ListRunsQuery = z.infer<typeof ListRunsQuerySchema>;
