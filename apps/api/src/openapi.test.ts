import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { fileURLToPath } from 'node:url';
import { Validator } from '@seriousme/openapi-schema-validator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/support/app.js';

const SPEC_PATH = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

type Operation = Record<string, unknown> & { 'x-implementation-status'?: string };
interface Spec {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
}

const key = (method: string, path: string): string => `${method.toUpperCase()} ${path}`;
const toOpenApiPath = (path: string): string => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

let spec: Spec;
let app: FastifyInstance;
const registered = new Set<string>();

beforeAll(async () => {
  const validator = new Validator();
  const result = await validator.validate(SPEC_PATH);
  if (!result.valid) throw new Error(`Invalid OpenAPI document: ${JSON.stringify(result.errors)}`);
  expect(validator.version).toBe('3.1');
  spec = validator.specification as unknown as Spec;

  // Fastify announces every new instance on this channel; hook routes before any are added.
  const onInit = (message: unknown): void => {
    const { fastify } = message as { fastify: FastifyInstance };
    fastify.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) {
        if (method === 'HEAD' || method === 'OPTIONS') continue;
        registered.add(key(method, toOpenApiPath(route.url)));
      }
    });
  };
  subscribe('fastify.initialization', onInit);
  try {
    // The static web app routes are not part of the API description: leave the SPA out.
    app = await buildTestApp({
      checkDatabase: async () => true,
      env: { WEB_DIST_DIR: '/nonexistent/midas-web' },
    });
    await app.ready();
  } finally {
    unsubscribe('fastify.initialization', onInit);
  }
});

afterAll(async () => {
  await app?.close();
});

function specOperations(): Array<{ id: string; operation: Operation }> {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => HTTP_METHODS.includes(method))
      .map(([method, operation]) => ({ id: key(method, path), operation })),
  );
}

describe('OpenAPI document', () => {
  it('is a valid OpenAPI 3.1 document', () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it('marks every operation as implemented or planned', () => {
    for (const { id, operation } of specOperations()) {
      expect(['implemented', 'planned'], id).toContain(operation['x-implementation-status']);
    }
  });

  it('documents every route registered by the Fastify app', () => {
    expect(registered.size).toBeGreaterThan(0);
    const documented = new Set(specOperations().map((o) => o.id));
    const missing = [...registered].filter((id) => !documented.has(id));
    expect(missing).toEqual([]);
  });

  it('only marks operations implemented when the app registers them, and vice versa', () => {
    const implemented = specOperations()
      .filter((o) => o.operation['x-implementation-status'] === 'implemented')
      .map((o) => o.id);
    expect(implemented.filter((id) => !registered.has(id))).toEqual([]);

    const planned = specOperations()
      .filter((o) => o.operation['x-implementation-status'] === 'planned')
      .map((o) => o.id);
    expect(planned.filter((id) => registered.has(id))).toEqual([]);
  });
});
