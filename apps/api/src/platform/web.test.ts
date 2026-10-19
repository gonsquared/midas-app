import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../test/support/app.js';

const INDEX = '<!doctype html><html><body><div id="root"></div></body></html>';
const HTML = { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };
const PROBLEM = /^application\/problem\+json/;

let dist: string;
let app: FastifyInstance | undefined;

beforeAll(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'midas-web-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), INDEX);
  writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(path.join(dist, 'theme-init.js'), 'document.documentElement.dataset.x = "1";');
  writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'export const a = 1;');
});

afterAll(() => rmSync(dist, { recursive: true, force: true }));

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function served(): Promise<FastifyInstance> {
  app = await buildTestApp({ env: { WEB_DIST_DIR: dist }, checkDatabase: async () => true });
  return app;
}

describe('serving the built SPA', () => {
  it('serves index.html at / with no-cache and the security headers', async () => {
    const res = await (await served()).inject({ method: 'GET', url: '/', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.body).toBe(INDEX);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('serves hashed assets as immutable for a year', async () => {
    const res = await (await served()).inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.body).toBe('export const a = 1;');
  });

  it('serves root files (favicon, theme-init.js) revalidated, not immutable', async () => {
    const instance = await served();
    for (const url of ['/favicon.svg', '/theme-init.js', '/index.html']) {
      const res = await instance.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('falls back to index.html for client routes that accept HTML', async () => {
    const instance = await served();
    for (const url of ['/dashboard', '/wallets/12/edit', '/login?next=%2Fbudgets']) {
      const res = await instance.inject({ method: 'GET', url, headers: HTML });
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toBe(INDEX);
      expect(res.headers['cache-control'], url).toBe('no-cache');
      expect(res.headers['content-security-policy'], url).toBeDefined();
    }
  });

  it('answers HEAD for client routes without a body', async () => {
    const instance = await served();
    const res = await instance.inject({ method: 'HEAD', url: '/dashboard', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('');
  });

  it('keeps the JSON problem 404 for unknown /api paths, even when the client accepts HTML', async () => {
    const instance = await served();
    for (const url of ['/api/v1/nope', '/api', '/api/', '/%61pi/v1/nope', '/API/v1/nope']) {
      const res = await instance.inject({ method: 'GET', url, headers: HTML });
      expect(res.statusCode, url).toBe(404);
      expect(res.headers['content-type'], url).toMatch(PROBLEM);
      expect(res.headers['cache-control'], url).toBe('no-store');
      expect(res.body, url).not.toContain('<div id="root">');
    }
  });

  it('keeps /health and /metrics out of the fallback', async () => {
    const instance = await served();
    const health = await instance.inject({ method: 'GET', url: '/health', headers: HTML });
    expect(health.headers['content-type']).toMatch(/^application\/json/);
    expect(health.headers['cache-control']).toBe('no-store');
    const metrics = await instance.inject({ method: 'GET', url: '/metrics', headers: HTML });
    expect(metrics.body).not.toContain('<div id="root">');
    const sub = await instance.inject({ method: 'GET', url: '/metrics/x', headers: HTML });
    expect(sub.headers['content-type']).toMatch(PROBLEM);
  });

  it('does not fall back for requests that do not accept HTML', async () => {
    const instance = await served();
    const noAccept = await instance.inject({ method: 'GET', url: '/dashboard' });
    expect(noAccept.statusCode).toBe(404);
    expect(noAccept.headers['content-type']).toMatch(PROBLEM);
    const json = await instance.inject({
      method: 'GET',
      url: '/dashboard',
      headers: { accept: 'application/json' },
    });
    expect(json.statusCode).toBe(404);
  });

  it('does not fall back for non-GET methods', async () => {
    const instance = await served();
    const res = await instance.inject({
      method: 'POST',
      url: '/dashboard',
      headers: HTML,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(PROBLEM);
  });

  it('returns the JSON 404 for a missing asset instead of index.html', async () => {
    const instance = await served();
    const res = await instance.inject({
      method: 'GET',
      url: '/assets/missing-deadbeef.js',
      headers: HTML,
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(PROBLEM);
  });

  it('does not serve files outside the dist folder through traversal', async () => {
    const outside = path.join(path.dirname(dist), 'midas-web-outside.txt');
    writeFileSync(outside, 'outside-secret');
    try {
      const instance = await served();
      for (const url of [
        '/assets/../../midas-web-outside.txt',
        '/assets/%2e%2e/%2e%2e/midas-web-outside.txt',
        '/assets/..%2f..%2fmidas-web-outside.txt',
        '/assets/',
      ]) {
        const res = await instance.inject({ method: 'GET', url });
        expect(res.body, url).not.toContain('outside-secret');
        expect(res.statusCode, url).toBeGreaterThanOrEqual(400);
      }
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('starts normally and serves the API when the dist folder does not exist', async () => {
    app = await buildTestApp({
      env: { WEB_DIST_DIR: path.join(dist, 'does-not-exist') },
      checkDatabase: async () => true,
    });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const page = await app.inject({ method: 'GET', url: '/dashboard', headers: HTML });
    expect(page.statusCode).toBe(404);
    expect(page.headers['content-type']).toMatch(PROBLEM);
  });

  it('starts normally when the dist folder has no index.html', async () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'midas-web-empty-'));
    try {
      app = await buildTestApp({ env: { WEB_DIST_DIR: empty }, checkDatabase: async () => true });
      const res = await app.inject({ method: 'GET', url: '/', headers: HTML });
      expect(res.statusCode).toBe(404);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
