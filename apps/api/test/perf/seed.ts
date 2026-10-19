import type pg from 'pg';

export interface PerfSeedResult {
  userId: string;
  walletIds: string[];
  /** A note fragment present on many rows, for the substring search. */
  noteNeedle: string;
  /** First and last seeded `occurred_on` dates. */
  firstDate: string;
  lastDate: string;
  rows: number;
}

/**
 * Bulk-loads `rows` transactions for one existing user across 5 USD wallets and the system
 * categories, with the normal triggers ON (so wallet balances stay consistent with the ledger).
 * About 10% are income. Dates are spread over `days` ending today; every row has a distinct
 * created_at so keyset paging has a stable tiebreak. Deterministic: no random().
 */
export async function seedTransactions(
  owner: pg.Pool,
  userId: string,
  rows: number,
  days = 1020,
): Promise<PerfSeedResult> {
  const wallets = await owner.query<{ id: string }>(
    `insert into wallets (user_id, name, type, currency, opening_balance_minor)
     select $1, 'Perf ' || g, 'bank', 'USD', 100000 from generate_series(1, 5) g
     returning id`,
    [userId],
  );
  const walletIds = wallets.rows.map((w) => w.id);
  const expense = await owner.query<{ id: string }>(
    `select id from categories where type = 'expense' and owner_user_id is null order by name`,
  );
  const income = await owner.query<{ id: string }>(
    `select id from categories where type = 'income' and owner_user_id is null order by name`,
  );
  await owner.query(
    `insert into transactions (user_id, wallet_id, type, category_id, amount_minor, currency,
                               occurred_on, note, created_at)
     select $1,
            ($2::uuid[])[1 + (g % 5)],
            case when g % 10 = 0 then 'income' else 'expense' end,
            case when g % 10 = 0 then ($4::uuid[])[1 + (g % cardinality($4::uuid[]))]
                 else ($3::uuid[])[1 + (g % cardinality($3::uuid[]))] end,
            100 + (g * 7919) % 90000,
            'USD',
            current_date - ((g * 31) % $5::int),
            case when g % 4 = 0 then null else 'perf ' || substr(md5(g::text), 1, 12) end,
            now() - (g || ' seconds')::interval
       from generate_series(1, $6::int) g`,
    [userId, walletIds, expense.rows.map((r) => r.id), income.rows.map((r) => r.id), days, rows],
  );
  // Make the planner statistics match a real, settled database.
  await owner.query('analyze transactions');
  await owner.query('analyze wallets');
  const range = await owner.query<{ first: string; last: string }>(
    `select min(occurred_on)::text as first, max(occurred_on)::text as last
       from transactions where user_id = $1`,
    [userId],
  );
  const needle = await owner.query<{ note: string }>(
    `select note from transactions where user_id = $1 and note is not null
      order by id limit 1`,
    [userId],
  );
  return {
    userId,
    walletIds,
    // 5 hex characters match roughly rows * 0.75 * 8 / 16^5 rows: selective but not empty.
    noteNeedle: (needle.rows[0]?.note ?? 'perf ').slice(5, 10),
    firstDate: range.rows[0]?.first ?? '',
    lastDate: range.rows[0]?.last ?? '',
    rows,
  };
}
