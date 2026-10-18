import { z } from 'zod';
import {
  CategoryTypeSchema,
  AdminUserSortSchema,
  AuditActionSchema,
  AuditTargetTypeSchema,
  RoleSchema,
  UserStatusSchema,
} from './enums.js';
import { LocalDateSchema } from './money.js';
import { CursorQueryShape, OffsetQueryShape, cursorPage, offsetPage } from './pagination.js';
import { booleanQuery, repeatable } from './query.js';

// --- Users (api-contract 2.17, 2.18 and 13). No financial data appears anywhere in this file. ---

export const AdminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: RoleSchema,
  status: UserStatusSchema,
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
  suspendedAt: z.iso.datetime().nullable(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUserDetailSchema = AdminUserSchema.extend({
  suspendedReason: z.string().nullable(),
  activeSessionCount: z.number().int().min(0),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;

export const AdminUserPageSchema = offsetPage(AdminUserSchema);
export type AdminUserPage = z.infer<typeof AdminUserPageSchema>;

const FORBIDDEN_TEXT_CHARS = /[\p{Cc}\p{Cf}]/u;

export const ListAdminUsersQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => !FORBIDDEN_TEXT_CHARS.test(value), {
      message: 'Must not contain control or invisible formatting characters.',
    })
    .optional(),
  role: RoleSchema.optional(),
  status: UserStatusSchema.optional(),
  sort: AdminUserSortSchema.default('createdAt_desc'),
  ...OffsetQueryShape,
});
export type ListAdminUsersQuery = z.infer<typeof ListAdminUsersQuerySchema>;

export const UserIdParamsSchema = z.strictObject({ userId: z.uuid() });

export const SUSPEND_REASON_MAX_LENGTH = 500;
export const SuspendUserRequestSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(SUSPEND_REASON_MAX_LENGTH)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\r\t]/g, '')), {
      message: 'Must not contain control or invisible formatting characters.',
    })
    .optional(),
});
export type SuspendUserRequest = z.infer<typeof SuspendUserRequestSchema>;

export const ChangeRoleRequestSchema = z.strictObject({ role: RoleSchema });
export type ChangeRoleRequest = z.infer<typeof ChangeRoleRequestSchema>;

// --- System categories (api-contract 14) ---

export const ListAdminCategoriesQuerySchema = z.strictObject({
  type: CategoryTypeSchema.optional(),
  includeRetired: booleanQuery.default(true),
});
export type ListAdminCategoriesQuery = z.infer<typeof ListAdminCategoriesQuerySchema>;

// --- Audit log (api-contract 2.19 and 15) ---

export const AuditLogEntrySchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  actor: z.object({ id: z.uuid(), email: z.string() }).nullable(),
  action: AuditActionSchema,
  target: z.object({ type: AuditTargetTypeSchema, id: z.uuid().nullable() }),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditLogPageSchema = cursorPage(AuditLogEntrySchema);
export type AuditLogPage = z.infer<typeof AuditLogPageSchema>;

export const ListAuditLogsQuerySchema = z
  .strictObject({
    actorId: z.uuid().optional(),
    actorEmail: z.string().trim().toLowerCase().min(1).max(254).optional(),
    action: repeatable(AuditActionSchema, 20).optional(),
    targetType: AuditTargetTypeSchema.optional(),
    targetId: z.uuid().optional(),
    from: LocalDateSchema.optional(),
    to: LocalDateSchema.optional(),
    ...CursorQueryShape,
  })
  .check((ctx) => {
    const { from, to, targetId, targetType } = ctx.value;
    // The target index starts with (target_type, target_id); without the type it cannot be used.
    if (targetId !== undefined && targetType === undefined) {
      ctx.issues.push({
        code: 'custom',
        input: targetId,
        path: ['targetType'],
        message: '`targetType` is required when `targetId` is given.',
        params: { code: 'TARGET_TYPE_REQUIRED' },
      });
    }
    if (from !== undefined && to !== undefined && to < from) {
      ctx.issues.push({
        code: 'custom',
        input: to,
        path: ['to'],
        message: '`to` must not be before `from`.',
        params: { code: 'INVALID_RANGE' },
      });
    }
  });
export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuerySchema>;

// --- Platform metrics (api-contract 2.20): aggregates only (ADR-018) ---

const count = z.number().int().min(0);
export const PlatformMetricsSchema = z.object({
  generatedAt: z.iso.datetime(),
  users: z.object({
    total: count,
    active30d: count,
    new30d: count,
    suspended: count,
    admins: count,
  }),
  wallets: z.object({ total: count, active: count }),
  transactions: z.object({ total: count, last30d: count }),
  recurringTemplates: z.object({ active: count }),
});
export type PlatformMetrics = z.infer<typeof PlatformMetricsSchema>;
