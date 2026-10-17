import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../test/support/app.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const preflight = (a: FastifyInstance, origin: string) =>
  a.inject({
    method: 'OPTIONS',
    url: '/api/v1/wallets',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
    },
  });

describe('CORS', () => {
  it('sends no CORS headers when no origin is configured (same-origin deployment)', async () => {
    app = await buildTestApp();
    const res = await preflight(app, 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const get = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(get.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows only the configured origins, with credentials and a restricted method list', async () => {
    app = await buildTestApp({ env: { CORS_ORIGINS: 'http://localhost:5173' } });
    const allowed = await preflight(app, 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(String(allowed.headers['access-control-allow-methods'])).not.toMatch(/PUT|TRACE/);
    expect(String(allowed.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'x-csrf-protection',
    );
    const denied = await preflight(app, 'https://evil.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never answers with a wildcard origin', async () => {
    app = await buildTestApp({ env: { CORS_ORIGINS: 'http://localhost:5173' } });
    const res = await preflight(app, 'null');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
