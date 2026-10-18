import { describe, expect, it } from 'vitest';
import {
  AuditLogEntrySchema,
  CategoryBreakdownQuerySchema,
  ChangeRoleRequestSchema,
  CreateBudgetRequestSchema,
  CreateRecurringTemplateRequestSchema,
  ExportTransactionsQuerySchema,
  ListAdminUsersQuerySchema,
  ListAuditLogsQuerySchema,
  PreviewRecurringRequestSchema,
  SuspendUserRequestSchema,
  SummaryQuerySchema,
  TrendQuerySchema,
  UpdateBudgetRequestSchema,
  UpdateRecurringTemplateRequestSchema,
} from './index.js';

const uuid = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';

describe('budget request schemas', () => {
  it('applies the contract defaults', () => {
    const parsed = CreateBudgetRequestSchema.parse({ scope: 'overall', amountMinor: 50000 });
    expect(parsed.period).toBe('monthly');
    expect(parsed.warningThresholdPct).toBe(80);
  });

  it('requires a category for category scope and forbids it for overall', () => {
    const noCategory = { scope: 'category', amountMinor: 1 };
    expect(CreateBudgetRequestSchema.safeParse(noCategory).success).toBe(false);
    const overallWithCategory = { scope: 'overall', amountMinor: 1, categoryId: uuid };
    expect(CreateBudgetRequestSchema.safeParse(overallWithCategory).success).toBe(false);
    const valid = { scope: 'category', amountMinor: 1, categoryId: uuid };
    expect(CreateBudgetRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects unknown fields, float amounts and thresholds outside 1 to 99', () => {
    const base = { scope: 'overall', amountMinor: 100 };
    expect(CreateBudgetRequestSchema.safeParse({ ...base, userId: uuid }).success).toBe(false);
    expect(CreateBudgetRequestSchema.safeParse({ ...base, amountMinor: 10.5 }).success).toBe(false);
    expect(CreateBudgetRequestSchema.safeParse({ ...base, amountMinor: 0 }).success).toBe(false);
    for (const warningThresholdPct of [0, 100, -1, 80.5]) {
      const result = CreateBudgetRequestSchema.safeParse({ ...base, warningThresholdPct });
      expect(result.success).toBe(false);
    }
    expect(CreateBudgetRequestSchema.safeParse({ ...base, warningThresholdPct: 99 }).success).toBe(
      true,
    );
  });

  it('does not allow changing scope, category, period or currency', () => {
    for (const field of ['scope', 'categoryId', 'period', 'currency']) {
      expect(UpdateBudgetRequestSchema.safeParse({ [field]: 'x' }).success).toBe(false);
    }
    expect(UpdateBudgetRequestSchema.safeParse({ amountMinor: 5 }).success).toBe(true);
  });
});

describe('recurring request schemas', () => {
  const valid = {
    name: 'Rent',
    type: 'expense',
    walletId: uuid,
    categoryId: uuid,
    amountMinor: 120000,
    frequency: 'monthly',
    startDate: '2026-11-01',
  };
  const parse = (value: unknown) => CreateRecurringTemplateRequestSchema.safeParse(value);

  it('defaults the interval to 1 and accepts an open end', () => {
    const parsed = CreateRecurringTemplateRequestSchema.parse(valid);
    expect(parsed.interval).toBe(1);
    expect(parsed.endDate).toBeUndefined();
  });

  it('rejects an end before the start, a bad interval and unknown fields', () => {
    expect(parse({ ...valid, endDate: '2026-10-31' }).success).toBe(false);
    for (const interval of [0, 100, 1.5]) {
      expect(parse({ ...valid, interval }).success).toBe(false);
    }
    expect(parse({ ...valid, nextRunOn: '2026-11-01' }).success).toBe(false);
    expect(parse({ ...valid, type: 'transfer' }).success).toBe(false);
  });

  it('does not allow changing the type on update', () => {
    expect(UpdateRecurringTemplateRequestSchema.safeParse({ type: 'income' }).success).toBe(false);
    expect(UpdateRecurringTemplateRequestSchema.safeParse({ endDate: null }).success).toBe(true);
  });

  it('bounds the preview count to 1 through 24', () => {
    const base = { frequency: 'weekly', startDate: '2026-10-01' };
    expect(PreviewRecurringRequestSchema.parse(base).count).toBe(5);
    expect(PreviewRecurringRequestSchema.safeParse({ ...base, count: 25 }).success).toBe(false);
    expect(PreviewRecurringRequestSchema.safeParse({ ...base, count: 0 }).success).toBe(false);
  });
});

describe('query schemas', () => {
  it('export takes the list filters but neither limit nor cursor', () => {
    expect(ExportTransactionsQuerySchema.parse({}).sort).toBe('date_desc');
    expect(ExportTransactionsQuerySchema.safeParse({ limit: '10' }).success).toBe(false);
    expect(ExportTransactionsQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(false);
    const inverted = { from: '2026-02-01', to: '2026-01-01' };
    expect(ExportTransactionsQuerySchema.safeParse(inverted).success).toBe(false);
  });

  it('reports validate ranges, group-by, currency and top', () => {
    expect(SummaryQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(TrendQuerySchema.safeParse({ groupBy: 'year' }).success).toBe(false);
    expect(TrendQuerySchema.safeParse({ currency: 'usd' }).success).toBe(false);
    expect(CategoryBreakdownQuerySchema.parse({}).top).toBe(8);
    expect(CategoryBreakdownQuerySchema.safeParse({ top: '21' }).success).toBe(false);
    expect(CategoryBreakdownQuerySchema.safeParse({ top: '0' }).success).toBe(false);
    expect(CategoryBreakdownQuerySchema.safeParse({ top: '5' }).data?.top).toBe(5);
  });

  it('admin lists validate paging, sort, filters and the audit actions', () => {
    const users = ListAdminUsersQuerySchema.parse({});
    expect(users).toMatchObject({ page: 1, pageSize: 25, sort: 'createdAt_desc' });
    expect(ListAdminUsersQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(ListAdminUsersQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(ListAdminUsersQuerySchema.safeParse({ page: '1000' }).success).toBe(true);
    expect(ListAdminUsersQuerySchema.safeParse({ page: '1001' }).success).toBe(false);
    expect(ListAdminUsersQuerySchema.safeParse({ sort: 'password_asc' }).success).toBe(false);
    expect(ListAdminUsersQuerySchema.safeParse({ role: 'root' }).success).toBe(false);
    const action = ListAuditLogsQuerySchema.parse({ action: 'admin.user_suspended' }).action;
    expect(action).toEqual(['admin.user_suspended']);
    expect(ListAuditLogsQuerySchema.safeParse({ action: 'drop.table' }).success).toBe(false);
    const id = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';
    expect(ListAuditLogsQuerySchema.safeParse({ targetId: id }).success).toBe(false);
    expect(ListAuditLogsQuerySchema.safeParse({ targetId: id, targetType: 'user' }).success).toBe(
      true,
    );
    const inverted = { from: '2026-02-01', to: '2026-01-01' };
    expect(ListAuditLogsQuerySchema.safeParse(inverted).success).toBe(false);
  });

  it('admin bodies are strict', () => {
    expect(ChangeRoleRequestSchema.safeParse({ role: 'admin', id: uuid }).success).toBe(false);
    expect(ChangeRoleRequestSchema.safeParse({ role: 'owner' }).success).toBe(false);
    expect(SuspendUserRequestSchema.safeParse({}).success).toBe(true);
    expect(SuspendUserRequestSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
    expect(SuspendUserRequestSchema.safeParse({ reason: 'ok', extra: 1 }).success).toBe(false);
  });

  it('an audit entry has no field for amounts or notes', () => {
    expect(Object.keys(AuditLogEntrySchema.shape)).toEqual([
      'id',
      'occurredAt',
      'actor',
      'action',
      'target',
      'ip',
      'userAgent',
      'requestId',
      'metadata',
    ]);
  });
});
