import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { adminHelpers } from '../support/admin.js';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

/**
 * Route-table authorization audit: every registered route is probed without credentials, so a
 * route added outside the authenticated scope (or an admin route without the role guard) fails
 * here instead of shipping unprotected.
 */
const PUBLIC_ROUTES = [
  'GET /health',
  'GET /metrics',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/password/forgot',
  'POST /api/v1/auth/password/reset/verify',
  'POST /api/v1/auth/password/reset',
].sort();

describeDb('route table authorization audit (real PostgreSQL)', () => {
  const routes: { method: string; url: string }[] = [];
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

  const { call, user } = adminHelpers(() => ctx);
  const withParams = (url: string) => url.replace(/:[A-Za-z0-9_]+/g, () => randomUUID());
  const key = (r: { method: string; url: string }) => `${r.method} ${r.url}`;

  /** Protected means the shared guard answered 401 UNAUTHENTICATED before any handler ran. */
  async function isProtected(route: { method: string; url: string }): Promise<boolean> {
    const res = await call(route.method as 'GET', withParams(route.url), null);
    return res.statusCode === 401 && (res.json() as { code?: string }).code === 'UNAUTHENTICATED';
  }

  it('discovers the full route table', () => {
    expect(routes.length).toBeGreaterThan(55);
  });

  it('answers 401 without credentials on every route outside the public allowlist', async () => {
    const offenders: string[] = [];
    for (const route of routes) {
      if (PUBLIC_ROUTES.includes(key(route))) continue;
      if (!(await isProtected(route))) offenders.push(key(route));
    }
    expect(offenders).toEqual([]);
  });

  it('exposes exactly the allowlisted public routes', async () => {
    const open: string[] = [];
    for (const route of routes) {
      if (!(await isProtected(route))) open.push(key(route));
    }
    expect(open.sort()).toEqual(PUBLIC_ROUTES);
    expect(
      routes
        .map(key)
        .filter((k) => PUBLIC_ROUTES.includes(k))
        .sort(),
    ).toEqual(PUBLIC_ROUTES);
  });

  it('answers 403 to a non-admin user on every /api/v1/admin route', async () => {
    await truncateAll(ctx.owner);
    const regular = await user();
    const adminRoutes = routes.filter((r) => r.url.startsWith('/api/v1/admin/'));
    expect(adminRoutes.length).toBeGreaterThan(8);
    for (const route of adminRoutes) {
      const res = await call(
        route.method as 'GET',
        withParams(route.url),
        regular,
        ['GET', 'DELETE'].includes(route.method) ? undefined : {},
      );
      expect(res.statusCode, key(route)).toBe(403);
    }
  });
});
