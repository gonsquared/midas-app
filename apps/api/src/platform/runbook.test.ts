import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../test/support/app.js';

/**
 * E10-F3-S1 (runbook for common failures): docs/operations/troubleshoot-api.md names metrics and
 * log lines an operator greps for. If code renames one, the runbook silently stops working, so
 * this test reads the runbook and checks every name it gives still exists: each metric family is
 * on the /metrics page, and each log message is a literal in the production source.
 * Skipped when the docs folder is not in the checkout.
 */
const here = dirname(fileURLToPath(import.meta.url));
const RUNBOOK = resolve(here, '../../../../docs/operations/troubleshoot-api.md');
const SRC = resolve(here, '..');
const TOKEN = 'runbook-metrics-token-with-32-characters-1';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe.skipIf(!existsSync(RUNBOOK))('troubleshoot-api.md names things that exist', () => {
  const text = existsSync(RUNBOOK) ? readFileSync(RUNBOOK, 'utf8') : '';
  // Metric families only: `midas_app` (the database role) is not one.
  const metricPattern = /\bmidas_(?:http|db|audit|scheduler|recurring|process)_[a-z_]+/g;
  const metrics = [...new Set(text.match(metricPattern) ?? [])].map((name) =>
    name.replace(/_(bucket|sum|count)$/, ''),
  );
  const app: { current?: FastifyInstance } = {};

  afterAll(async () => {
    await app.current?.close();
  });

  it('lists the metrics operators are told to watch', () => {
    expect(metrics).toEqual(
      expect.arrayContaining([
        'midas_http_requests_total',
        'midas_audit_write_failures_total',
        'midas_scheduler_runs_total',
      ]),
    );
  });

  it('serves every metric the runbook names on /metrics', async () => {
    app.current = await buildTestApp({
      env: { METRICS_TOKEN: TOKEN },
      checkDatabase: async () => true,
    });
    const res = await app.current.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const missing = metrics.filter((name) => !res.body.includes(`# TYPE ${name} `));
    expect(missing).toEqual([]);
  });

  it('only uses log messages that are literals in the production source', () => {
    // Messages the runbook gives as `quoted` log text in its Triage and Troubleshooting sections.
    const messages = [
      'request completed',
      'request rejected',
      'unhandled error',
      'audit write failed',
      'background task failed',
      'recurring tick error',
      'recurring template paused after repeated failures',
      'transaction export exceeded its time cap',
    ];
    for (const message of messages)
      expect(text, `runbook mentions "${message}"`).toContain(message);
    const source = sourceFiles(SRC)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const missing = messages.filter((message) => !source.includes(`'${message}'`));
    // `request completed` is Fastify's own message (disableRequestLogging is off), not a literal.
    expect(missing.filter((message) => message !== 'request completed')).toEqual([]);
  });
});
