import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { BackgroundTasks } from '../../src/platform/background.js';
import { MemoryMailer } from '../../src/platform/mailer/mailer.js';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { testConfig } from '../support/app.js';
import { describeDb, truncateAll } from '../support/db.js';
import { systemCategory } from '../support/ledger.js';
import { seedTransactions, type PerfSeedResult } from './seed.js';

/**
 * E10-F2-S4 performance sanity (architecture 8.3 and section 11): one user with 100k
 * transactions, the list, the reports, the dashboard fan-out and the export.
 *
 * Run with `pnpm --filter @midas/api test:perf` (excluded from the default run). Requests go
 * through Fastify `inject` against a real PostgreSQL 17, so the numbers include routing, auth,
 * validation, SQL and serialization but not the network or a reverse proxy.
 *
 * Two thresholds per scenario. `target` is the architecture figure (p95): missing it is a
 * regression and is reported in the table. `limit` is deliberately generous (a multiple of the
 * target, because CI and Docker Desktop machines are noisy) and is the only one that fails the
 * run. Set PERF_TRANSACTIONS to scale the dataset down and PERF_REPORT to write a JSON report.
 */
const ROWS = Number(process.env['PERF_TRANSACTIONS'] ?? 100_000);
const SAMPLES = Number(process.env['PERF_SAMPLES'] ?? 20);
const WARMUP = 3;

interface Measurement {
  name: string;
  ap: string;
  target: number;
  limit: number;
  p50: number;
  p95: number;
  max: number;
  status: string;
}
const results: Measurement[] = [];

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

describeDb(`performance sanity with ${ROWS} transactions for one user`, () => {
  let ctx: IntegrationContext;
  let headers: { authorization: string };
  let seed: PerfSeedResult;
  let categoryId: string;
  let cursor: string;
  let deepCursor: string;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
    await truncateAll(ctx.owner);
    const user = await registerUser(ctx.app, { currency: 'USD' });
    headers = user.headers;
    const noise = await registerUser(ctx.app, { currency: 'USD' });
    const started = Date.now();
    seed = await seedTransactions(ctx.owner, user.id, ROWS);
    // A second user so the per-user indexes have to do their job.
    await seedTransactions(ctx.owner, noise.id, Math.min(20_000, Math.floor(ROWS / 5)));
    process.stdout.write(`[perf] seeded in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
    categoryId = (await systemCategory(ctx.app, user, 'expense', 'Groceries')).id;
    for (const body of [
      { scope: 'overall', amountMinor: 5_000_000 },
      { scope: 'category', categoryId, amountMinor: 800_000 },
    ]) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/budgets',
        headers,
        payload: body,
      });
      expect(res.statusCode).toBe(201);
    }
    const first = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/transactions?limit=50',
      headers,
    });
    cursor = first.json<{ nextCursor: string }>().nextCursor;
    // Walk 100 pages deep (5,000 rows) to get a deep keyset cursor.
    deepCursor = cursor;
    for (let page = 0; page < 100; page += 1) {
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/transactions?limit=50&cursor=${deepCursor}`,
        headers,
      });
      deepCursor = res.json<{ nextCursor: string }>().nextCursor;
    }
  });

  afterAll(async () => {
    const lines = results.map(
      (r) =>
        `${r.name.padEnd(58)} ${r.ap.padEnd(6)} p50 ${r.p50.toFixed(1).padStart(8)}  p95 ${r.p95
          .toFixed(1)
          .padStart(
            8,
          )}  max ${r.max.toFixed(1).padStart(8)}  target ${String(r.target).padStart(4)}  ${r.status}`,
    );
    process.stdout.write(`\n[perf] ms, ${ROWS} rows\n${lines.join('\n')}\n`);
    const report = process.env['PERF_REPORT'];
    if (report) {
      writeFileSync(report, JSON.stringify({ rows: ROWS, samples: SAMPLES, results }, null, 2));
    }
    await ctx.close();
  });

  /** Measures `run` SAMPLES times after a warm-up; asserts the generous limit on p95. */
  async function measure(
    name: string,
    ap: string,
    target: number,
    run: () => Promise<void>,
    limit = target * 3,
  ) {
    for (let i = 0; i < WARMUP; i += 1) await run();
    const times: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const start = performance.now();
      await run();
      times.push(performance.now() - start);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    const status = p95 <= target ? 'within target' : p95 <= limit ? 'OVER TARGET' : 'OVER LIMIT';
    results.push({
      name,
      ap,
      target,
      limit,
      p50: percentile(sorted, 50),
      p95,
      max: sorted.at(-1) ?? 0,
      status,
    });
    expect(p95, `${name}: p95 ${p95.toFixed(1)} ms against the limit of ${limit} ms`).toBeLessThan(
      limit,
    );
  }

  const get = async (url: string) => {
    const res = await ctx.app.inject({ method: 'GET', url, headers });
    if (res.statusCode !== 200) throw new Error(`${url} -> ${res.statusCode} ${res.body}`);
    return res;
  };

  const from = () => seed.firstDate;
  const to = () => seed.lastDate;
  const daysAgo = (n: number) =>
    new Date(Date.parse(`${to()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const monthStart = () => `${to().slice(0, 8)}01`;

  it('seeded the expected amount of data for one user', async () => {
    const count = await ctx.owner.query(
      `select count(*)::int as n from transactions where user_id = $1`,
      [seed.userId],
    );
    expect(count.rows[0].n).toBe(ROWS);
    expect(seed.noteNeedle).toHaveLength(5);
  });

  // AP-07: transaction list, p95 < 200 ms at 100k transactions per user.
  it('lists the first page (date desc)', async () => {
    await measure('list: first page, 50 rows', 'AP-07', 200, async () => {
      await get('/api/v1/transactions?limit=50');
    });
  });

  it('lists a page after a cursor, near and deep (keyset paging)', async () => {
    await measure('list: page 2 by cursor', 'AP-07', 200, async () => {
      await get(`/api/v1/transactions?limit=50&cursor=${cursor}`);
    });
    await measure('list: page 102 by cursor (deep)', 'AP-07', 200, async () => {
      await get(`/api/v1/transactions?limit=50&cursor=${deepCursor}`);
    });
  });

  it('lists with sorts, filters and search', async () => {
    const wallet = seed.walletIds[0];
    const cases: Array<[string, string]> = [
      ['list: date asc', '/api/v1/transactions?limit=50&sort=date_asc'],
      ['list: amount desc', '/api/v1/transactions?limit=50&sort=amount_desc'],
      ['list: wallet filter', `/api/v1/transactions?limit=50&walletId=${wallet}`],
      ['list: category filter', `/api/v1/transactions?limit=50&categoryId=${categoryId}`],
      ['list: type filter (income)', '/api/v1/transactions?limit=50&type=income'],
      [
        'list: one month date range',
        `/api/v1/transactions?limit=50&from=${monthStart()}&to=${to()}`,
      ],
      [
        'list: amount range, amount asc',
        '/api/v1/transactions?limit=50&minAmountMinor=20000&maxAmountMinor=30000&sort=amount_asc',
      ],
      ['list: note search (q)', `/api/v1/transactions?limit=50&q=${seed.noteNeedle}`],
      [
        'list: wallet + category + whole range + q',
        `/api/v1/transactions?limit=50&walletId=${wallet}&categoryId=${categoryId}&from=${from()}&to=${to()}&q=perf`,
      ],
    ];
    for (const [name, url] of cases) {
      await measure(name, 'AP-07', 200, async () => {
        await get(url);
      });
    }
  });

  // AP-05: wallets with balances, p95 < 50 ms.
  it('lists wallets with balances', async () => {
    await measure('wallets with balances', 'AP-05', 50, async () => {
      await get('/api/v1/wallets');
    });
  });

  // AP-09: aggregations, p95 < 300 ms.
  it('reports: summary, trend and category breakdown', async () => {
    const yearAgo = `${Number(to().slice(0, 4)) - 1}${to().slice(4)}`;
    const cases: Array<[string, string]> = [
      ['reports/summary: current month', '/api/v1/reports/summary'],
      ['reports/summary: whole dataset', `/api/v1/reports/summary?from=${from()}&to=${to()}`],
      // A trend holds at most 400 buckets (REPORT limit), so daily buckets cover the last year only.
      [
        'reports/trend: last 390 days by day',
        `/api/v1/reports/trend?from=${daysAgo(390)}&to=${to()}&groupBy=day`,
      ],
      [
        'reports/trend: whole dataset by week',
        `/api/v1/reports/trend?from=${from()}&to=${to()}&groupBy=week`,
      ],
      [
        'reports/trend: whole dataset by month',
        `/api/v1/reports/trend?from=${from()}&to=${to()}&groupBy=month`,
      ],
      ['reports/trend: current month', `/api/v1/reports/trend?from=${monthStart()}&to=${to()}`],
      [
        'reports/category-breakdown: whole dataset',
        `/api/v1/reports/category-breakdown?from=${from()}&to=${to()}&top=8`,
      ],
      [
        'reports/category-breakdown: income, one year',
        `/api/v1/reports/category-breakdown?from=${yearAgo}&to=${to()}&type=income`,
      ],
    ];
    for (const [name, url] of cases) {
      await measure(name, 'AP-09', 300, async () => {
        await get(url);
      });
    }
  });

  it('budgets with status', async () => {
    await measure('budgets list with status', 'AP-09', 300, async () => {
      await get('/api/v1/budgets');
    });
  });

  it('dashboard fan-out (the six calls the dashboard makes at once)', async () => {
    await measure(
      'dashboard: summary+trend+breakdown+budgets+wallets+list',
      'AP-09',
      300,
      async () => {
        await Promise.all([
          get('/api/v1/reports/summary'),
          get(`/api/v1/reports/trend?from=${monthStart()}&to=${to()}`),
          get(`/api/v1/reports/category-breakdown?from=${monthStart()}&to=${to()}`),
          get('/api/v1/budgets'),
          get('/api/v1/wallets'),
          get('/api/v1/transactions?limit=10'),
        ]);
      },
      1200,
    );
  });

  // AP-08: export, streamed with a server-side cursor: constant memory.
  it('exports every row as CSV with bounded memory', async () => {
    // A second app on a real socket: `inject` buffers the whole body, which hides memory use.
    const app = await buildApp({
      config: testConfig({ RATE_LIMIT_ENABLED: 'false', EXPORT_MAX_DURATION_SECONDS: '600' }),
      db: ctx.client.db,
      mailer: new MemoryMailer(),
      background: new BackgroundTasks(() => undefined),
    });
    try {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const port = (app.server.address() as AddressInfo).port;
      global.gc?.();
      const baseline = process.memoryUsage().rss;
      let peak = baseline;
      const timer = setInterval(() => {
        peak = Math.max(peak, process.memoryUsage().rss);
      }, 50);
      const started = performance.now();
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/transactions/export`, { headers });
      expect(res.status).toBe(200);
      let bytes = 0;
      let lines = 0;
      const reader = res.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        for (const byte of value) if (byte === 10) lines += 1;
      }
      const ms = performance.now() - started;
      clearInterval(timer);
      const growthMb = (peak - baseline) / 1024 / 1024;
      const sizeMb = bytes / 1024 / 1024;
      process.stdout.write(
        `[perf] export: ${lines} lines, ${sizeMb.toFixed(1)} MiB in ${(ms / 1000).toFixed(1)} s, rss growth ${growthMb.toFixed(0)} MiB\n`,
      );
      results.push({
        name: `export: all ${ROWS} rows streamed (single run)`,
        ap: 'AP-08',
        target: 0,
        limit: 60_000,
        p50: ms,
        p95: ms,
        max: ms,
        status: `${lines} lines, ${sizeMb.toFixed(1)} MiB, rss +${growthMb.toFixed(0)} MiB`,
      });
      expect(lines).toBeGreaterThanOrEqual(ROWS);
      expect(ms).toBeLessThan(60_000);
      // The test process also holds the whole seed result set and the other app, so this is a
      // loose bound: buffering a file this size on top of normal churn would exceed it.
      expect(growthMb).toBeLessThan(Math.max(200, sizeMb * 2));
    } finally {
      await app.close();
    }
  });
});
