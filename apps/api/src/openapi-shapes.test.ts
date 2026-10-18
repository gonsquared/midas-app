import { fileURLToPath } from 'node:url';
import { Validator } from '@seriousme/openapi-schema-validator';
import {
  AdminUserDetailSchema,
  AdminUserSchema,
  AuditLogEntrySchema,
  BudgetSchema,
  BudgetStatusSchema,
  CreateBudgetRequestSchema,
  CreateRecurringTemplateRequestSchema,
  PlatformMetricsSchema,
  RecurringRunSchema,
  RecurringTemplateSchema,
  ReportCategoryBreakdownSchema,
  ReportSummarySchema,
  ReportTrendSchema,
  UpdateBudgetRequestSchema,
  UpdateRecurringTemplateRequestSchema,
} from '@midas/shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

const SPEC_PATH = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));

interface ComponentSchema {
  properties?: Record<string, unknown>;
  allOf?: Array<ComponentSchema & { $ref?: string }>;
  required?: string[];
}

/**
 * The Sprint 3 payload shapes in the API description must carry the same fields as the shared
 * Zod schemas that the server and the web client use (the earlier drift check covered routes only).
 */
const PAIRS: Array<[string, z.ZodObject<z.ZodRawShape>]> = [
  ['Budget', BudgetSchema],
  ['BudgetStatus', BudgetStatusSchema],
  ['CreateBudgetRequest', CreateBudgetRequestSchema as never],
  ['UpdateBudgetRequest', UpdateBudgetRequestSchema],
  ['RecurringTemplate', RecurringTemplateSchema],
  ['RecurringRun', RecurringRunSchema],
  ['CreateRecurringTemplateRequest', CreateRecurringTemplateRequestSchema as never],
  ['UpdateRecurringTemplateRequest', UpdateRecurringTemplateRequestSchema as never],
  ['AdminUser', AdminUserSchema],
  ['AdminUserDetail', AdminUserDetailSchema],
  ['AuditLogEntry', AuditLogEntrySchema],
  ['PlatformMetrics', PlatformMetricsSchema],
  ['ReportSummary', ReportSummarySchema],
  ['ReportTrend', ReportTrendSchema],
  ['ReportCategoryBreakdown', ReportCategoryBreakdownSchema],
];

describe('OpenAPI component schemas match the shared Zod schemas (Sprint 3)', () => {
  it.each(PAIRS)('%s has the same property names', async (name, zod) => {
    const validator = new Validator();
    await validator.validate(SPEC_PATH);
    const components = (
      validator.specification as unknown as {
        components: { schemas: Record<string, ComponentSchema> };
      }
    ).components.schemas;
    const propertiesOf = (schema: (ComponentSchema & { $ref?: string }) | undefined): string[] => {
      if (!schema) return [];
      const referenced = schema.$ref
        ? propertiesOf(components[schema.$ref.split('/').pop() ?? ''])
        : [];
      return [
        ...referenced,
        ...Object.keys(schema.properties ?? {}),
        ...(schema.allOf ?? []).flatMap(propertiesOf),
      ];
    };
    const documented = [...new Set(propertiesOf(components[name]))].sort();
    const implemented = Object.keys(zod.shape).sort();
    expect(documented).toEqual(implemented);
  });
});
