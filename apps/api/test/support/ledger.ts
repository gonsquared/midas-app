import type { Category, Transaction, Transfer, Wallet } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import type { TestUser } from './api.js';

/** Thin API helpers for ledger tests. They assert the happy status so failures point at setup. */
export async function createWallet(
  app: FastifyInstance,
  user: TestUser,
  body: Record<string, unknown> = {},
): Promise<Wallet> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/wallets',
    headers: user.headers,
    payload: { name: `Wallet ${Math.random().toString(36).slice(2, 8)}`, type: 'bank', ...body },
  });
  if (res.statusCode !== 201) throw new Error(`createWallet failed: ${res.body}`);
  return res.json<Wallet>();
}

export async function getWallet(app: FastifyInstance, user: TestUser, id: string): Promise<Wallet> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/wallets/${id}`,
    headers: user.headers,
  });
  if (res.statusCode !== 200) throw new Error(`getWallet failed: ${res.body}`);
  return res.json<Wallet>();
}

export async function systemCategory(
  app: FastifyInstance,
  user: TestUser,
  type: 'income' | 'expense',
  name?: string,
): Promise<Category> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/categories?type=${type}`,
    headers: user.headers,
  });
  const items = res.json<{ items: Category[] }>().items.filter((c) => c.system);
  const found = name ? items.find((c) => c.name === name) : items[0];
  if (!found) throw new Error('no system category');
  return found;
}

export async function createCategory(
  app: FastifyInstance,
  user: TestUser,
  body: Record<string, unknown> = {},
): Promise<Category> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/categories',
    headers: user.headers,
    payload: {
      name: `Cat ${Math.random().toString(36).slice(2, 8)}`,
      type: 'expense',
      icon: 'tag',
      color: 'blue',
      ...body,
    },
  });
  if (res.statusCode !== 201) throw new Error(`createCategory failed: ${res.body}`);
  return res.json<Category>();
}

export async function createTransaction(
  app: FastifyInstance,
  user: TestUser,
  body: Record<string, unknown>,
): Promise<Transaction> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/transactions',
    headers: user.headers,
    payload: { amountMinor: 1000, occurredOn: '2026-10-01', ...body },
  });
  if (res.statusCode !== 201) throw new Error(`createTransaction failed: ${res.body}`);
  return res.json<Transaction>();
}

export async function createTransfer(
  app: FastifyInstance,
  user: TestUser,
  body: Record<string, unknown>,
): Promise<Transfer> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/transfers',
    headers: user.headers,
    payload: { amountMinor: 1000, occurredOn: '2026-10-01', ...body },
  });
  if (res.statusCode !== 201) throw new Error(`createTransfer failed: ${res.body}`);
  return res.json<Transfer>();
}

interface Queryable {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * The `cli db:check` invariants (database design 14.4 and 16.5), as owner queries:
 * - C-02: every wallet's stored ledger balance equals the sum of its signed amounts;
 * - C-01: every transfer header has an out and an in leg that agree (the assert_transfer_pair
 *   predicate), and no leg points at a missing header.
 * Ledger integration tests run it in `afterEach`, so any test that leaves drift fails.
 */
export async function expectLedgerConsistent(owner: Queryable): Promise<void> {
  const drift = await owner.query(`
    select w.id, w.ledger_balance_minor as stored,
           coalesce((select sum(t.signed_amount_minor) from transactions t where t.wallet_id = w.id), 0) as actual
      from wallets w
     where w.ledger_balance_minor <>
           coalesce((select sum(t.signed_amount_minor) from transactions t where t.wallet_id = w.id), 0)`);
  if (drift.rows.length > 0) throw new Error(`wallet balance drift: ${JSON.stringify(drift.rows)}`);

  const broken = await owner.query(`
    select tr.id, 'pair' as problem
      from transfers tr
     where not exists (
       select 1
         from transactions o
         join transactions i on i.transfer_id = o.transfer_id and i.transfer_direction = 'in'
        where o.transfer_id = tr.id and o.transfer_direction = 'out'
          and o.user_id = tr.user_id and i.user_id = tr.user_id
          and o.wallet_id <> i.wallet_id
          and o.occurred_on = i.occurred_on
          and o.note is not distinct from i.note
          and (o.currency <> i.currency or o.amount_minor = i.amount_minor))
    union all
    select distinct t.transfer_id, 'orphan leg'
      from transactions t
     where t.transfer_id is not null
       and not exists (select 1 from transfers tr where tr.id = t.transfer_id)`);
  if (broken.rows.length > 0) throw new Error(`broken transfers: ${JSON.stringify(broken.rows)}`);
}

/**
 * Resolves once `count` backends of the app pool are waiting on a heavyweight lock (a row lock
 * wait shows up as wait_event_type 'Lock'). Lets concurrency tests order requests precisely.
 */
export async function waitForLockWaiters(
  owner: Queryable,
  count: number,
  timeoutMs = 4_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await owner.query(
      `select count(*)::int as n from pg_stat_activity
        where datname = current_database() and application_name = 'midas-api'
          and wait_event_type = 'Lock'`,
    );
    if (Number(res.rows[0]?.n) >= count) return;
    if (Date.now() > deadline) {
      throw new Error(`expected ${count} lock waiters, saw ${String(res.rows[0]?.n)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
