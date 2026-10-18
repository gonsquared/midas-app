import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { TEST_SECRET } from '../support/app.js';
import { describeDb, truncateAll } from '../support/db.js';

const INJECTIONS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  '" OR ""="',
  '%00',
  '${7*7}',
  '../../etc/passwd',
];

describeDb('Sprint 3 endpoints: injection, headers and error hygiene (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
  });
  const { call, admin, user } = adminHelpers(() => ctx);
  const tables = async () =>
    (await ctx.owner.query(`select count(*)::int as n from users`)).rows[0].n as number;

  it('treats hostile query values as data or rejects them, never as SQL', async () => {
    const boss = await admin();
    for (const payload of INJECTIONS) {
      const q = encodeURIComponent(payload);
      const urls = [
        `/api/v1/admin/users?q=${q}`,
        `/api/v1/admin/users?sort=${q}`,
        `/api/v1/admin/audit-logs?actorEmail=${q}`,
        `/api/v1/admin/audit-logs?cursor=${q}`,
        `/api/v1/admin/audit-logs?action=${q}`,
        `/api/v1/transactions/export?q=${q}`,
        `/api/v1/reports/trend?currency=${q}`,
        `/api/v1/reports/category-breakdown?type=${q}`,
        `/api/v1/budgets?date=${q}`,
        `/api/v1/recurring-templates?status=${q}`,
      ];
      for (const url of urls) {
        const res = await call('GET', url, boss);
        expect([200, 400], `${url} -> ${res.statusCode}`).toContain(res.statusCode);
        expect(res.body).not.toMatch(/syntax error|pg_|stack|at .*\.ts/i);
      }
    }
    expect(await tables()).toBe(1);
  });

  it('rejects forged or tampered tokens on admin routes', async () => {
    const boss = await admin();
    const parts = boss.accessToken.split('.');
    const forgedAlgNone = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${parts[1]}.`;
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: boss.id, role: 'admin' })).toString('base64url')}.${parts[2]}`;
    const wrongKey = await new SignJWT({
      sid: '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e',
      role: 'admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(boss.id)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(`${TEST_SECRET}-wrong`));
    for (const token of [forgedAlgNone, tampered, wrongKey, '', 'Bearer']) {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode, token.slice(0, 20)).toBe(401);
    }
  });

  it('a role claim in the token or a header never grants admin', async () => {
    const regular = await user();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { ...regular.headers, 'x-role': 'admin', 'x-admin': '1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('sends no-store and security headers on the new routes', async () => {
    const boss = await admin();
    for (const url of [
      '/api/v1/admin/users',
      '/api/v1/budgets',
      '/api/v1/reports/summary',
      '/api/v1/recurring-templates',
      '/api/v1/transactions/export',
    ]) {
      const res = await call('GET', url, boss);
      expect(res.headers['cache-control'], url).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('answers malformed JSON, wrong media type and oversized bodies with a generic 400', async () => {
    const boss = await admin();
    const post = (payload: string, type = 'application/json') =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/budgets',
        headers: { ...boss.headers, 'content-type': type },
        payload,
      });
    for (const res of [
      await post('{"scope": '),
      await post('scope=overall', 'application/x-www-form-urlencoded'),
      await post('{"__proto__":{"admin":true},"scope":"overall","amountMinor":1}'),
      await post(JSON.stringify({ scope: 'overall', amountMinor: 1, pad: 'x'.repeat(70_000) })),
    ]) {
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(res.body).not.toMatch(/Unexpected token|SyntaxError|JSON\.parse/);
    }
  });

  it('keeps unknown admin and report paths as plain problem+json 404s', async () => {
    const boss = await admin();
    for (const url of [
      '/api/v1/admin',
      '/api/v1/admin/nothing',
      '/api/v1/reports',
      '/api/v1/budgets/x/y',
    ]) {
      const res = await call('GET', url, boss);
      expect([404, 400]).toContain(res.statusCode);
      expect(res.headers['content-type']).toContain('application/problem+json');
    }
  });
});
