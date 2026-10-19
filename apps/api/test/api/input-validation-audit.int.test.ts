import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { adminHelpers } from '../support/admin.js';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

/**
 * E10-F1-S2 input-validation review, made executable: every route the app registers is probed
 * with hostile input. A route added later is covered automatically, and a handler that forgets
 * its schema fails here instead of passing unnoticed.
 */
interface RouteInfo {
  method: string;
  url: string;
}

/** Routes that take no input at all (no body, no query), so there is nothing to reject. */
const NO_QUERY = new Set([
  'GET /health',
  'GET /metrics',
  'GET /api/v1/me',
  'GET /api/v1/admin/metrics',
  // Single-resource reads: the id is validated (see the malformed-parameter test) and the handler
  // never reads the query string, so an extra parameter has no effect.
  'GET /api/v1/wallets/:walletId',
  'GET /api/v1/transactions/:transactionId',
  'GET /api/v1/transfers/:transferId',
  'GET /api/v1/recurring-templates/:templateId',
  'GET /api/v1/admin/users/:userId',
]);

/**
 * POST routes that act on the URL alone and never read a body. They must ignore a hostile body
 * (nothing from it can reach a column), so they are checked for "no 5xx, no state change" only.
 */
const BODYLESS_POSTS = new Set([
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/wallets/:walletId/archive',
  'POST /api/v1/wallets/:walletId/unarchive',
  'POST /api/v1/recurring-templates/:templateId/pause',
  'POST /api/v1/recurring-templates/:templateId/resume',
  'POST /api/v1/admin/categories/:categoryId/retire',
  'POST /api/v1/admin/categories/:categoryId/restore',
  'POST /api/v1/admin/users/:userId/reactivate',
]);

describeDb('input validation review: every registered route (real PostgreSQL)', () => {
  const routes: RouteInfo[] = [];
  let ctx: IntegrationContext;

  beforeAll(async () => {
    const onInit = (message: unknown): void => {
      const { fastify } = message as { fastify: FastifyInstance };
      fastify.addHook('onRoute', (route) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        for (const method of methods) {
          if (method === 'HEAD' || method === 'OPTIONS') continue;
          routes.push({ method, url: route.url });
        }
      });
    };
    subscribe('fastify.initialization', onInit);
    try {
      ctx = await createIntegrationContext();
      await ctx.app.ready();
    } finally {
      unsubscribe('fastify.initialization', onInit);
    }
  });
  afterAll(async () => {
    await ctx.close();
  });

  const { call, admin } = adminHelpers(() => ctx);
  const withParams = (url: string, value: () => string) => url.replace(/:[A-Za-z0-9_]+/g, value);
  const isPublic = (url: string) => url.startsWith('/health') || url.startsWith('/metrics');

  it('discovers the full route table', () => {
    expect(routes.length).toBeGreaterThan(55);
  });

  it('rejects a malformed path parameter with 400 on every parameterised route', async () => {
    await truncateAll(ctx.owner);
    const boss = await admin();
    const parameterised = routes.filter((r) => r.url.includes(':'));
    expect(parameterised.length).toBeGreaterThan(20);
    for (const route of parameterised) {
      const res = await call(
        route.method as 'GET',
        withParams(route.url, () => 'not-a-uuid'),
        boss,
        route.method === 'GET' || route.method === 'DELETE' ? undefined : {},
      );
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(400);
    }
  });

  it('rejects unknown fields and wrong body types on every route that reads a body', async () => {
    await truncateAll(ctx.owner);
    const boss = await admin();
    const bodyRoutes = routes.filter(
      (r) =>
        ['POST', 'PATCH', 'PUT'].includes(r.method) && !BODYLESS_POSTS.has(`${r.method} ${r.url}`),
    );
    expect(bodyRoutes.length).toBeGreaterThan(20);
    for (const route of bodyRoutes) {
      const id = randomUUID();
      const url = withParams(route.url, () => id);
      const who = route.url.startsWith('/api/v1/auth/') ? null : boss;
      for (const payload of [
        { __unknownField__: 1, role: 'admin', userId: id, id },
        ['array', 'instead', 'of', 'object'],
      ]) {
        const res = await call(route.method as 'POST', url, who, payload);
        expect(res.statusCode, `${route.method} ${route.url} ${JSON.stringify(payload)}`).toBe(400);
        expect(res.headers['content-type']).toContain('application/problem+json');
      }
    }
  });

  it('keeps bodyless POST routes free of 5xx under a hostile body and a changed role', async () => {
    await truncateAll(ctx.owner);
    const boss = await admin();
    const before = await ctx.owner.query(`select id, role from users order by id`);
    for (const key of BODYLESS_POSTS) {
      const [method, url] = key.split(' ') as [string, string];
      const res = await call(
        method as 'POST',
        withParams(url, () => randomUUID()),
        url.startsWith('/api/v1/auth/') ? null : boss,
        { __unknownField__: 1, role: 'admin' },
      );
      expect(res.statusCode, key).toBeLessThan(500);
    }
    const after = await ctx.owner.query(`select id, role from users order by id`);
    expect(after.rows).toEqual(before.rows);
  });

  it('rejects unknown query parameters on every GET route that takes a query', async () => {
    await truncateAll(ctx.owner);
    const boss = await admin();
    const gets = routes.filter((r) => r.method === 'GET' && !NO_QUERY.has(`GET ${r.url}`));
    expect(gets.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const route of gets) {
      const url = `${withParams(route.url, () => randomUUID())}?__unknownParam__=1`;
      const res = await call('GET', url, boss);
      if (res.statusCode !== 400) offenders.push(`GET ${route.url} -> ${res.statusCode}`);
    }
    expect(offenders).toEqual([]);
  });

  it('never answers a hostile request with a 5xx', async () => {
    await truncateAll(ctx.owner);
    const boss = await admin();
    for (const route of routes.filter((r) => !isPublic(r.url))) {
      const url = withParams(route.url, () => "'; drop table users; --");
      const res = await call(
        route.method as 'GET',
        encodeURI(url),
        route.url.startsWith('/api/v1/auth/') ? null : boss,
        ['GET', 'DELETE'].includes(route.method) ? undefined : { a: { $ne: null } },
      );
      expect(res.statusCode, `${route.method} ${route.url}`).toBeLessThan(500);
    }
  });
});
