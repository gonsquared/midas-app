import { afterAll, beforeAll, expect, it } from 'vitest';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

const ROWS = 60_000;

/**
 * E5-F3-S1 criterion 3: a large export streams instead of being built in memory. The response is
 * read over a real socket in chunks, and abandoning a download must give the pooled connection
 * back (the test pool has 4 connections, so a leak shows up as a hang within a few attempts).
 */
describeDb('CSV export streaming (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  let baseUrl: string;
  let token: string;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
    await truncateAll(ctx.owner);
    const user = await registerUser(ctx.app);
    token = user.accessToken;
    const seed = await ctx.owner.connect();
    try {
      await seed.query('set session_replication_role = replica');
      const wallet = await seed.query(
        `insert into wallets (user_id, name, type, currency) values ($1, 'Big', 'bank', 'USD') returning id`,
        [user.id],
      );
      const category = await seed.query(
        `select id from categories where type = 'expense' and owner_user_id is null limit 1`,
      );
      await seed.query(
        `insert into transactions (user_id, wallet_id, type, category_id, amount_minor, currency, occurred_on, note)
         select $1, $2, 'expense', $3, 100 + g % 5000, 'USD', date '2020-01-01' + (g % 2000), 'row ' || g
           from generate_series(1, ${ROWS}) g`,
        [user.id, wallet.rows[0].id, category.rows[0].id],
      );
      await seed.query('set session_replication_role = default');
    } finally {
      seed.release();
    }
    await ctx.owner.query('analyze transactions');
    baseUrl = await ctx.app.listen({ host: '127.0.0.1', port: 0 });
  }, 120_000);

  afterAll(async () => {
    await ctx.close();
  });

  const request = (signal?: AbortSignal) =>
    fetch(`${baseUrl}/api/v1/transactions/export`, {
      headers: { authorization: `Bearer ${token}` },
      ...(signal && { signal }),
    });

  async function openTransactions(): Promise<number> {
    const res = await ctx.owner.query(
      `select count(*)::int as n from pg_stat_activity
        where datname = current_database() and application_name = 'midas-api'
          and state like 'idle in transaction%'`,
    );
    return res.rows[0].n as number;
  }

  it('delivers every row in many chunks', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    let chunks = 0;
    let bytes = 0;
    let newlines = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks += 1;
      bytes += value.length;
      for (const byte of value) if (byte === 10) newlines += 1;
    }
    expect(newlines).toBe(ROWS + 1);
    expect(chunks).toBeGreaterThan(20);
    expect(bytes).toBeGreaterThan(ROWS * 40);
    await expect.poll(openTransactions).toBe(0);
  }, 60_000);

  it('releases the connection when the client abandons the download', async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const controller = new AbortController();
      const response = await request(controller.signal);
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      await reader.cancel();
      controller.abort();
    }
    await expect.poll(openTransactions, { timeout: 10_000 }).toBe(0);
    const again = await request();
    expect(again.status).toBe(200);
    await again.body?.cancel();
  }, 60_000);
});
