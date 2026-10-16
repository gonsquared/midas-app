import { z } from 'zod';

export const FieldErrorSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

/** RFC 9457 Problem Details with Midas extensions (api-contract 2.2). */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
  requestId: z.string(),
  errors: z.array(FieldErrorSchema).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;

/** Error code catalogue with HTTP status (api-contract 1.5). */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  INVALID_CURSOR: 400,
  RANGE_TOO_LARGE: 400,
  RESET_TOKEN_INVALID: 400,
  INVALID_CURRENT_PASSWORD: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_INVALID: 401,
  ACCOUNT_SUSPENDED: 403,
  FORBIDDEN: 403,
  SYSTEM_CATEGORY_READ_ONLY: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  WALLET_NAME_TAKEN: 409,
  WALLET_ARCHIVED: 409,
  WALLET_CURRENCY_LOCKED: 409,
  WALLET_IN_USE: 409,
  CATEGORY_NAME_TAKEN: 409,
  CATEGORY_IN_USE: 409,
  BUDGET_EXISTS: 409,
  LIMIT_REACHED: 409,
  TRANSFER_LEG_IMMUTABLE: 409,
  TEMPLATE_ENDED: 409,
  CANNOT_MODIFY_SELF: 409,
  LAST_ADMIN: 409,
  INVALID_REFERENCE: 422,
  CATEGORY_TYPE_MISMATCH: 422,
  CATEGORY_RETIRED: 422,
  SAME_WALLET_TRANSFER: 422,
  TO_AMOUNT_REQUIRED: 422,
  TO_AMOUNT_MISMATCH: 422,
  REASSIGN_TARGET_INVALID: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const HEALTH_STATUSES = ['ok', 'degraded'] as const;

export const HealthSchema = z.object({
  status: z.enum(HEALTH_STATUSES),
  version: z.string(),
  uptimeSeconds: z.number().int(),
  checks: z.object({ database: z.enum(['up', 'down']) }),
});
export type Health = z.infer<typeof HealthSchema>;
