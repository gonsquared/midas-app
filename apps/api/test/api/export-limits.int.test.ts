import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createIntegrationContext,
  registerUser,
  type IntegrationContext,
  type TestUser,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

const ROWS = 150_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Export limits (real PostgreSQL): one concurrent export per user, other users unaffected, and an
 * absolute time cap that aborts the response (truncated, not a clean 200) and frees the slot.
 */
describeDb('CSV export per-user gate and time cap (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  let baseUrl: string;
  let alice: TestUser;
  let bob: TestUser;

  async function seedFor(user: TestUser, rows: number) {
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
           from generate_series(1, ${rows}) g`,
        [user.id, wallet.rows[0].id, category.rows[0].id],
      );
      await seed.query('set session_replication_role = default');
    } finally {
      seed.release();
    }
  }

  beforeAll(async () => {
    ctx = await createIntegrationContext({ EXPORT_MAX_DURATION_SECONDS: '2' });
    await truncateAll(ctx.owner);
    alice = await registerUser(ctx.app);
    bob = await registerUser(ctx.app);
    await seedFor(alice, ROWS);
    await seedFor(bob, 10);
    await ctx.owner.query('analyze transactions');
    baseUrl = await ctx.app.listen({ host: '127.0.0.1', port: 0 });
  }, 120_000);

  afterAll(async () => {
    await ctx.close();
  });

  const request = (user: TestUser) =>
    fetch(`${baseUrl}/api/v1/transactions/export`, {
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

  async function openTransactions(): Promise<number> {
    const res = await ctx.owner.query(
      `select count(*)::int as n from pg_stat_activity
        where datname = current_database() and application_name = 'midas-api'
          and state like 'idle in transaction%'`,
    );
    return res.rows[0].n as number;
  }

  it('allows one export per user at a time and never blocks other users', async () => {
    const first = await request(alice);
    expect(first.status).toBe(200);
    const reader = (first.body as ReadableStream<Uint8Array>).getReader();
    await reader.read(); // alice's export is running and holds her slot

    const second = await request(alice);
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).not.toBeNull();
    await second.body?.cancel();

    const other = await request(bob);
    expect(other.status).toBe(200);
    expect((await other.text()).split('\r\n').length).toBe(12); // header + 10 rows + trailing

    await reader.cancel();
    await expect.poll(openTransactions, { timeout: 10_000 }).toBe(0);
    const again = await request(alice); // slot is free again
    expect(again.status).toBe(200);
    await again.body?.cancel();
    await expect.poll(openTransactions, { timeout: 10_000 }).toBe(0);
  }, 60_000);

  it('aborts an export that exceeds the time cap: the client sees a failed, truncated response', async () => {
    const response = await request(alice);
    expect(response.status).toBe(200);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await sleep(3000); // stalled client: past the 2 s cap, the server destroys the socket
    const outcome = await (async () => {
      try {
        for (;;) {
          const { done } = await reader.read();
          if (done) return 'completed';
        }
      } catch {
        return 'aborted';
      }
    })();
    expect(outcome).toBe('aborted');
    await expect.poll(openTransactions, { timeout: 10_000 }).toBe(0);
    const again = await request(alice);
    expect(again.status).toBe(200); // the slot was released by the abort
    await again.body?.cancel();
  }, 60_000);
});
