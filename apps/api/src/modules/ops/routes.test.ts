import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../../test/support/app.js';
import { tokensMatch } from './routes.js';

const TOKEN = 'metrics-token-with-at-least-32-characters-1';
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(env: Record<string, string> = {}) {
  app = await buildTestApp({ env, checkDatabase: async () => true });
  return app;
}

const scrape = (server: FastifyInstance, token = TOKEN) =>
  server.inject({ method: 'GET', url: '/metrics', headers: { authorization: `Bearer ${token}` } });

describe('GET /metrics (E9-F3-S2)', () => {
  it('is disabled with 404 while METRICS_TOKEN is unset', async () => {
    const res = await (await build()).inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('rejects a missing, malformed or wrong token with 401', async () => {
    const server = await build({ METRICS_TOKEN: TOKEN });
    for (const authorization of [undefined, 'Bearer', 'Bearer wrong', `Basic ${TOKEN}`, TOKEN]) {
      const res = await server.inject({
        method: 'GET',
        url: '/metrics',
        ...(authorization && { headers: { authorization } }),
      });
      expect(res.statusCode, String(authorization)).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
      expect(res.body).not.toContain('midas_');
    }
  });

  it('does not accept the token in the query string', async () => {
    const server = await build({ METRICS_TOKEN: TOKEN });
    const res = await server.inject({ method: 'GET', url: `/metrics?token=${TOKEN}` });
    expect(res.statusCode).toBe(401);
  });

  it('serves Prometheus text with the token, including request counters', async () => {
    const server = await build({ METRICS_TOKEN: TOKEN });
    await server.inject({ method: 'GET', url: '/health' });
    const res = await scrape(server);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain; version=0.0.4');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toContain('# TYPE midas_http_requests_total counter');
    expect(res.body).toContain(
      'midas_http_requests_total{method="GET",route="/health",status="200"} 1',
    );
    expect(res.body).toContain('midas_http_request_duration_seconds_bucket');
    expect(res.body).not.toContain(TOKEN);
  });
});

describe('GET /metrics hardening', () => {
  it('labels unmatched paths with a constant, so URLs cannot blow up the label set', async () => {
    const server = await build({ METRICS_TOKEN: TOKEN });
    await server.inject({ method: 'GET', url: '/api/v1/nope-1' });
    await server.inject({ method: 'GET', url: '/api/v1/nope-2' });
    const res = await scrape(server);
    expect(res.body).toContain('route="unmatched",status="404"} 2');
    expect(res.body).not.toContain('nope-1');
  });

  it('is rate limited per IP before the token is compared', async () => {
    const server = await build({
      METRICS_TOKEN: TOKEN,
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_GLOBAL_IP_MAX: '3',
    });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await scrape(server, 'guess')).statusCode);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
  });

  it('compares tokens of any length in constant time without throwing', () => {
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(tokensMatch('x', TOKEN)).toBe(false);
    expect(tokensMatch(`${TOKEN}extra`, TOKEN)).toBe(false);
  });
});
