import { afterAll, beforeAll, expect, it } from 'vitest';
import { breakdownQuery, totalsQuery, trendQuery } from '../../src/modules/reports/repository.js';
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

const ROWS_PER_USER = 100_000;

/**
 * E7-F1-S2 criterion 3 (performance on a large data set): every report aggregation must stay on
 * ix_transactions__user_date (database design AP-09), without a sequential scan, with 200k rows
 * in the table and 100k for the user; and the endpoints answer within a generous time budget.
 */
describeDb('report query plans and timing (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
    await truncateAll(ctx.owner);
    const user = await registerUser(ctx.app, { currency: 'EUR' });
    const other = await registerUser(ctx.app);
    userId = user.id;
    token = user.accessToken;
    const seed = await ctx.owner.connect();
    try {
      await seed.query('set session_replication_role = replica');
      for (const owner of [user.id, other.id]) {
        const wallet = await seed.query(
          `insert into wallets (user_id, name, type, currency) values ($1, 'W', 'bank', 'EUR') returning id`,
          [owner],
        );
        await seed.query(
          `insert into transactions (user_id, wallet_id, type, category_id, amount_minor, currency, occurred_on)
           select $1, $2, case when g % 5 = 0 then 'income' else 'expense' end,
                  (select id from categories where system_key = case when g % 5 = 0 then 'income.salary'
                     else 'expense.' || (array['groceries','dining','housing','utilities','transport'])[1 + g % 5] end),
                  100 + (g * 7919) % 90000, 'EUR', date '2021-01-01' + (g % 1800)
             from generate_series(1, ${ROWS_PER_USER}) g`,
          [owner, wallet.rows[0].id],
        );
      }
      await seed.query('set session_replication_role = default');
    } finally {
      seed.release();
    }
    await ctx.owner.query('analyze transactions');
  }, 180_000);

  afterAll(async () => {
    await ctx.close();
  });

  async function plan(query: { compile(): { sql: string; parameters: readonly unknown[] } }) {
    const compiled = query.compile();
    const result = await ctx.owner.query(`explain (format json) ${compiled.sql}`, [
      ...compiled.parameters,
    ]);
    const root = (result.rows[0]['QUERY PLAN'] as Array<{ Plan: PlanNode }>)[0]?.Plan as PlanNode;
    const indexes = new Set<string>();
    const seqScans: string[] = [];
    walk(root, (node) => {
      if (node['Index Name']) indexes.add(node['Index Name']);
      if (node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'transactions')
        seqScans.push('transactions');
    });
    return { indexes, seqScans };
  }

  it('totals, trend and breakdown use the covering date index and never scan the table', async () => {
    const db = ctx.client.db;
    const queries = {
      totals: totalsQuery(db, userId, '2024-01-01', '2024-12-31'),
      trendMonth: trendQuery(db, userId, 'EUR', '2024-01-01', '2024-12-31', 'month'),
      trendDay: trendQuery(db, userId, 'EUR', '2024-01-01', '2024-03-31', 'day'),
      breakdown: breakdownQuery(db, userId, 'expense', 'EUR', '2024-01-01', '2024-12-31'),
    };
    for (const [name, query] of Object.entries(queries)) {
      const { indexes, seqScans } = await plan(query);
      expect(seqScans, name).toEqual([]);
      expect(indexes.has('ix_transactions__user_date'), name).toBe(true);
    }
  });

  it('budget spending for a period uses the date index too', async () => {
    const compiled = ctx.client.db
      .selectFrom('transactions')
      .select(['currency', 'categoryId'])
      .where('userId', '=', userId)
      .where('type', '=', 'expense')
      .where('occurredOn', '>=', '2024-01-01')
      .where('occurredOn', '<=', '2024-01-31')
      .groupBy(['currency', 'categoryId']);
    const { indexes, seqScans } = await plan(compiled);
    expect(seqScans).toEqual([]);
    expect(indexes.has('ix_transactions__user_date')).toBe(true);
  });

  it('answers the report endpoints quickly on a 100k-row ledger', async () => {
    const urls = [
      '/api/v1/reports/summary?from=2021-01-01&to=2025-12-31',
      '/api/v1/reports/trend?from=2021-01-01&to=2025-12-31&groupBy=month&currency=EUR',
      '/api/v1/reports/trend?from=2024-01-01&to=2024-12-31&groupBy=day&currency=EUR',
      '/api/v1/reports/category-breakdown?from=2021-01-01&to=2025-12-31&currency=EUR',
    ];
    for (const url of urls) {
      const started = performance.now();
      const res = await ctx.app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${token}` },
      });
      const elapsed = performance.now() - started;
      expect(res.statusCode, url).toBe(200);
      console.log(`${url.split('?')[0]} ${elapsed.toFixed(0)} ms`);
      expect(elapsed, url).toBeLessThan(1500);
    }
  });
});
