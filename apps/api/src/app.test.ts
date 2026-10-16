import { HealthSchema, ProblemSchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/support/app.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /health', () => {
  it('reports ok with database up', async () => {
    app = await buildTestApp({ checkDatabase: async () => true });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthSchema.parse(res.json());
    expect(body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 503 degraded when the database is down', async () => {
    app = await buildTestApp({ checkDatabase: async () => false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(HealthSchema.parse(res.json())).toMatchObject({
      status: 'degraded',
      checks: { database: 'down' },
    });
  });

  it('reports database down against an unreachable server (real probe, no mock)', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
  });
});

describe('request ids', () => {
  it('echoes a valid inbound X-Request-Id', async () => {
    app = await buildTestApp({ checkDatabase: async () => true });
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'client-req-12345' },
    });
    expect(res.headers['x-request-id']).toBe('client-req-12345');
  });

  it('replaces an invalid inbound id with a generated one', async () => {
    app = await buildTestApp({ checkDatabase: async () => true });
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'bad id with spaces!' },
    });
    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(res.headers['x-request-id']).not.toBe('bad id with spaces!');
  });
});

describe('error format', () => {
  it('returns problem+json with the request id for unknown routes', async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/nope?x=1',
      headers: { 'x-request-id': 'trace-me-12345' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemSchema.parse(res.json());
    expect(problem).toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      instance: '/nope',
      requestId: 'trace-me-12345',
    });
  });

  it('maps malformed JSON to 400 VALIDATION_FAILED without internals', async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    expect(res.statusCode).toBe(400);
    const problem = ProblemSchema.parse(res.json());
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(res.body).not.toMatch(/Unexpected|JSON|stack|node_modules/);
  });

  it('hides internals on unexpected errors and logs them with the request id', async () => {
    app = await buildTestApp({
      authUnitOfWork: async () => {
        throw new Error('connection to 10.0.0.5 refused: password=hunter2');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'user@example.com',
        password: 'correct horse battery staple 42',
        displayName: 'User',
      },
    });
    expect(res.statusCode).toBe(500);
    expect(ProblemSchema.parse(res.json())).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(res.body).not.toMatch(/10\.0\.0\.5|hunter2|refused/);
  });
});

describe('health contract and hardening', () => {
  it('returns exactly the documented Health fields and nothing sensitive', async () => {
    app = await buildTestApp({ checkDatabase: async () => true });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(Object.keys(res.json()).sort()).toEqual([
      'checks',
      'status',
      'uptimeSeconds',
      'version',
    ]);
    expect(res.body).not.toMatch(/postgres|password|secret|127\.0\.0\.1/i);
  });

  it('does not leak the cause when the readiness probe throws', async () => {
    app = await buildTestApp({
      checkDatabase: async () => {
        throw new Error('boom 10.1.2.3');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('10.1.2.3');
    expect(ProblemSchema.parse(res.json()).code).toBe('INTERNAL_ERROR');
  });

  it('does not accept POST on /health', async () => {
    app = await buildTestApp({ checkDatabase: async () => true });
    const res = await app.inject({ method: 'POST', url: '/health' });
    expect(res.statusCode).toBe(404);
  });
});

describe('security headers', () => {
  it('sets helmet headers and the strict CSP', async () => {
    app = await buildTestApp({ checkDatabase: async () => true });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sends HSTS in production only', async () => {
    app = await buildTestApp({
      env: { NODE_ENV: 'production' },
      checkDatabase: async () => true,
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });
});
