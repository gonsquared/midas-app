import { ListTransactionsQuerySchema } from '@midas/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildListQuery } from '../../src/modules/transactions/list-query.js';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

function walk(node: PlanNode, visit: (n: PlanNode) => void): void {
  visit(node);
  for (const child of node.Plans ?? []) walk(child, visit);
}

/**
 * E5-F2-S2: the list queries must use the planned indexes (database design 8.1, AP-07). The
 * dataset is large enough that a sequential scan on `transactions` would be a real regression.
 */
describeDb('transaction list query plans (EXPLAIN, real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  let userId: string;
  let walletId: string;
  let categoryId: string;
  let cursorKey: { primary: string; createdAt: string; id: string };

  beforeAll(async () => {
    ctx = await createIntegrationContext();
    await truncateAll(ctx.owner);
    const user = await registerUser(ctx.app);
    userId = user.id;
    const other = await registerUser(ctx.app);
    const seed = await ctx.owner.connect();
    try {
      // Bulk load without the balance trigger firing per row; plans do not depend on balances.
      await seed.query(`set session_replication_role = replica`);
      const wallets = await seed.query(
        `insert into wallets (user_id, name, type, currency)
         select u, 'W' || g, 'bank', 'EUR' from (values ($1::uuid), ($2::uuid)) v(u), generate_series(1, 3) g
         returning id, user_id`,
        [user.id, other.id],
      );
      const mine = wallets.rows.filter((w) => w.user_id === user.id).map((w) => w.id as string);
      walletId = mine[0] as string;
      const cat = await seed.query(
        `select id from categories where type = 'expense' and owner_user_id is null order by name limit 1`,
      );
      categoryId = cat.rows[0].id as string;
      for (const [owner, ids] of [
        [user.id, mine],
        [other.id, wallets.rows.filter((w) => w.user_id === other.id).map((w) => w.id as string)],
      ] as const) {
        await seed.query(
          `insert into transactions (user_id, wallet_id, type, category_id, amount_minor, currency, occurred_on, note, created_at)
           select $1, ($2::uuid[])[1 + (g % 3)],
                  'expense', ($3::uuid), 100 + (g * 7919) % 90000, 'EUR',
                  date '2022-01-01' + (g % 1000), 'note ' || substr(md5(g::text), 1, 12),
                  now() - (g || ' seconds')::interval
             from generate_series(1, 30000) g`,
          [owner, ids, categoryId],
        );
      }
      await seed.query(`set session_replication_role = default`);
    } finally {
      seed.release();
    }
    // Full-table statistics (300 x 1000 rows covers the 60k rows) so the asserted plans do not
    // depend on the random ANALYZE sample.
    const stats = await ctx.owner.connect();
    try {
      await stats.query('set default_statistics_target = 1000');
      await stats.query('analyze transactions');
    } finally {
      stats.release();
    }
    const row = await ctx.owner.query(
      `select occurred_on::text as d, created_at, id from transactions
        where user_id = $1 order by occurred_on desc, created_at desc, id desc offset 50 limit 1`,
      [userId],
    );
    cursorKey = {
      primary: row.rows[0].d as string,
      createdAt: (row.rows[0].created_at as Date).toISOString(),
      id: row.rows[0].id as string,
    };
  }, 120_000);

  afterAll(async () => {
    await ctx.close();
  });

  async function plan(query: Record<string, unknown>, after = false) {
    const parsed = ListTransactionsQuerySchema.parse(query);
    const compiled = buildListQuery(
      ctx.client.db,
      userId,
      parsed,
      after ? cursorKey : null,
    ).compile();
    const result = await ctx.owner.query(`explain (format json) ${compiled.sql}`, [
      ...compiled.parameters,
    ]);
    const root = (result.rows[0]['QUERY PLAN'] as Array<{ Plan: PlanNode }>)[0]?.Plan as PlanNode;
    const indexes = new Set<string>();
    const seqScans: string[] = [];
    walk(root, (node) => {
      if (node['Index Name']) indexes.add(node['Index Name']);
      if (node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'transactions') {
        seqScans.push(node['Relation Name']);
      }
    });
    return { indexes, seqScans };
  }

  it('date sort uses ix_transactions__user_date, also for a keyset page', async () => {
    for (const sort of ['date_desc', 'date_asc']) {
      for (const after of [false, true]) {
        const { indexes, seqScans } = await plan({ sort }, after);
        expect(seqScans).toEqual([]);
        expect(indexes.has('ix_transactions__user_date')).toBe(true);
      }
    }
  });

  it('amount sort uses ix_transactions__user_amount, also for a keyset page', async () => {
    for (const sort of ['amount_desc', 'amount_asc']) {
      const { indexes, seqScans } = await plan({ sort });
      expect(seqScans).toEqual([]);
      expect(indexes.has('ix_transactions__user_amount')).toBe(true);
    }
  });

  it('date range and amount range filters stay on the user indexes', async () => {
    const dated = await plan({ from: '2023-01-01', to: '2023-01-31' });
    expect(dated.seqScans).toEqual([]);
    expect(dated.indexes.has('ix_transactions__user_date')).toBe(true);
    const amounts = await plan({
      minAmountMinor: '100',
      maxAmountMinor: '300',
      sort: 'amount_asc',
    });
    expect(amounts.seqScans).toEqual([]);
    expect(amounts.indexes.has('ix_transactions__user_amount')).toBe(true);
  });

  it('wallet, category and note filters avoid sequential scans', async () => {
    const wallet = await plan({ walletId: walletId, from: '2022-03-01', to: '2022-03-03' });
    expect(wallet.seqScans).toEqual([]);
    const walletOnly = await plan({ walletId });
    expect(walletOnly.seqScans).toEqual([]);
    const category = await plan({ categoryId, from: '2022-03-01', to: '2022-03-03' });
    expect(category.seqScans).toEqual([]);
    const text = await plan({ q: 'zzqx9' });
    expect(text.seqScans).toEqual([]);
  });

  it('combined filters with the transfer counterpart join avoid sequential scans', async () => {
    const combined = await plan({
      walletId: walletId,
      type: 'expense',
      q: 'note',
      from: '2022-01-01',
      sort: 'date_asc',
    });
    expect(combined.seqScans).toEqual([]);
  });
});
