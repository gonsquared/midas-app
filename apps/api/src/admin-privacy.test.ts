import { fileURLToPath } from 'node:url';
import { Validator } from '@seriousme/openapi-schema-validator';
import { describe, expect, it } from 'vitest';

const SPEC_PATH = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));
const FINANCIAL_FIELDS = new Set([
  'wallet',
  'wallets',
  'transaction',
  'transactions',
  'amountMinor',
  'balanceMinor',
  'openingBalanceMinor',
  'incomeMinor',
  'expenseMinor',
  'netMinor',
  'note',
  'budget',
  'budgets',
  'recurringTemplates',
  'totalsByCurrency',
  'spentMinor',
]);
const METRICS_FIELDS = [
  'active',
  'active30d',
  'admins',
  'generatedAt',
  'last30d',
  'new30d',
  'recurringTemplates',
  'suspended',
  'total',
  'transactions',
  'users',
  'wallets',
];

type Json = Record<string, unknown>;

/** Every property name reachable from a schema, following $ref. */
function propertyNames(schema: unknown, spec: Json): Set<string> {
  const names = new Set<string>();
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const record = node as Json;
    const ref = record.$ref;
    if (typeof ref === 'string') {
      if (seen.has(ref)) return;
      seen.add(ref);
      let target: unknown = spec;
      for (const part of ref.replace(/^#\//, '').split('/')) target = (target as Json)?.[part];
      visit(target);
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === 'properties' && typeof value === 'object' && value) {
        for (const name of Object.keys(value)) names.add(name);
      }
      visit(value);
    }
  };
  visit(schema);
  return names;
}

/** ADR-018: admin routes are designed so that no financial record can be returned. */
describe('admin privacy boundary in the API description (ADR-018)', () => {
  it('no admin operation can return wallets, transactions, budgets or templates', async () => {
    const validator = new Validator();
    expect((await validator.validate(SPEC_PATH)).valid).toBe(true);
    const spec = validator.specification as unknown as Json;
    const paths = spec.paths as Record<string, Record<string, Json>>;
    const adminPaths = Object.keys(paths).filter((p) => p.startsWith('/api/v1/admin/'));
    expect(adminPaths.length).toBeGreaterThanOrEqual(9);
    for (const path of adminPaths) {
      expect(path, path).not.toMatch(/wallet|transaction|budget|recurring|report|export/i);
      for (const [method, operation] of Object.entries(paths[path] ?? {})) {
        if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;
        const names = propertyNames(operation.responses, spec);
        if (path === '/api/v1/admin/metrics') {
          // Platform-wide counts only: nothing but the documented aggregate groups.
          const ok = propertyNames((operation.responses as Json)['200'], spec);
          expect([...ok].sort()).toEqual([...METRICS_FIELDS].sort());
          continue;
        }
        const leaked = [...names].filter((name) => FINANCIAL_FIELDS.has(name));
        expect(leaked, `${method} ${path}`).toEqual([]);
      }
    }
  });
});
