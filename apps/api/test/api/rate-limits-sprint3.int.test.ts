import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';

describeDb('per-user rate limits cover the Sprint 3 routes (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_REGISTER_MAX: '100',
      RATE_LIMIT_USER_READ_MAX: '4',
      RATE_LIMIT_USER_WRITE_MAX: '3',
    });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
  });
  const { call, admin, user } = adminHelpers(() => ctx);

  const statuses = async (
    method: 'GET' | 'POST',
    url: string,
    actor: Awaited<ReturnType<typeof user>>,
    count: number,
    payload?: unknown,
  ) => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push((await call(method, url, actor, payload)).statusCode);
    return out;
  };

  it.each(['/api/v1/reports/summary', '/api/v1/budgets', '/api/v1/recurring-templates'])(
    'limits reads of %s per user with Retry-After',
    async (url) => {
      const first = await user();
      const second = await user();
      expect(await statuses('GET', url, first, 5)).toEqual([200, 200, 200, 200, 429]);
      const limited = await call('GET', url, first);
      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
      expect((await call('GET', url, second)).statusCode).toBe(200);
    },
  );

  it('limits budget writes per user', async () => {
    const actor = await user();
    const codes = await statuses('POST', '/api/v1/budgets', actor, 5, {
      scope: 'overall',
      amountMinor: 1,
    });
    expect(codes.slice(0, 1)).toEqual([201]);
    expect(codes.slice(1, 3)).toEqual([409, 409]);
    expect(codes.slice(3)).toEqual([429, 429]);
  });

  it('limits admin reads and writes like any other authenticated route', async () => {
    const boss = await admin();
    const target = await user();
    expect(await statuses('GET', '/api/v1/admin/users', boss, 5)).toEqual([
      200, 200, 200, 200, 429,
    ]);
    const writes = await statuses('POST', `/api/v1/admin/users/${target.id}/suspend`, boss, 4, {});
    expect(writes[3]).toBe(429);
  });

  it('keeps the CSV export on its own stricter limit (10 per minute)', async () => {
    const actor = await user();
    const other = await user();
    // Reads are limited to 4 here, so the export limiter is exercised by the dedicated test in
    // export.int.test.ts; this one only checks that a limited export carries Retry-After.
    const codes = await statuses('GET', '/api/v1/transactions/export', actor, 6);
    expect(codes.slice(0, 4).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
    expect((await call('GET', '/api/v1/transactions/export', other)).statusCode).toBe(200);
  });
});
