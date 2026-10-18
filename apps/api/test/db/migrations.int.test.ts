import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  getMigrationStatus,
  listMigrationFiles,
  runMigrations,
  verifyMigrations,
} from '../../src/platform/db/migrate.js';
import { dbTestInfo, describeDb, ownerPool, truncateAll } from '../support/db.js';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA';
const bytes = (n: number, fill = 1) => Buffer.alloc(n, fill);

function insertSql(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const params = keys.map((_, i) => '$' + (i + 1));
  return {
    text: 'INSERT INTO ' + table + ' (' + keys.join(', ') + ') VALUES (' + params.join(', ') + ')',
    values: Object.values(row),
  };
}

describeDb('schema migrations (real PostgreSQL)', () => {
  let owner: pg.Pool;
  beforeAll(() => {
    owner = ownerPool();
  });
  afterAll(async () => {
    await owner.end();
  });
  beforeEach(async () => {
    await truncateAll(owner);
  });

  async function insertUser(overrides: Record<string, unknown> = {}): Promise<string> {
    const row = {
      email: 'user@example.com',
      password_hash: HASH,
      display_name: 'User',
      ...overrides,
    };
    const q = insertSql('users', row);
    const res = await owner.query<{ id: string }>(q.text + ' RETURNING id', q.values);
    return res.rows[0]!.id;
  }

  const rejects = (promise: Promise<unknown>, code: string, constraint: string) =>
    expect(promise).rejects.toMatchObject({ code, constraint });

  it('has applied every migration and installed the extensions and shared function', async () => {
    const status = await getMigrationStatus({ connectionString: dbTestInfo()!.ownerUrl });
    expect(status.length).toBe((await listMigrationFiles()).length);
    expect(status.every((entry) => entry.applied)).toBe(true);

    const ext = await owner.query(
      "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','btree_gin')",
    );
    expect(ext.rowCount).toBe(2);
    const fn = await owner.query("SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'");
    expect(fn.rowCount).toBe(1);
  });

  it('applies column defaults for a new user', async () => {
    const id = await insertUser();
    const { rows } = await owner.query('SELECT * FROM users WHERE id = $1', [id]);
    expect(rows[0]).toMatchObject({
      role: 'user',
      status: 'active',
      currency: 'USD',
      locale: 'en-US',
      timezone: 'UTC',
      theme: 'system',
      last_login_at: null,
    });
  });

  it('enforces a unique, normalised email', async () => {
    await insertUser();
    await rejects(insertUser(), '23505', 'uq_users__email');
    await rejects(
      insertUser({ email: 'Other@Example.com' }),
      '23514',
      'ck_users__email_normalized',
    );
  });

  it('rejects non-argon2id hashes, bad enums and inconsistent suspension', async () => {
    await rejects(insertUser({ password_hash: 'plain' }), '23514', 'ck_users__password_hash');
    await rejects(insertUser({ role: 'root' }), '23514', 'ck_users__role');
    await rejects(insertUser({ status: 'banned' }), '23514', 'ck_users__status');
    await rejects(insertUser({ theme: 'neon' }), '23514', 'ck_users__theme');
    await rejects(insertUser({ currency: 'usd' }), '23514', 'ck_users__currency');
    await rejects(insertUser({ status: 'suspended' }), '23514', 'ck_users__suspension');
    await rejects(insertUser({ display_name: ' padded ' }), '23514', 'ck_users__display_name');
  });

  it('maintains updated_at through the shared trigger', async () => {
    const id = await insertUser();
    const before = await owner.query('SELECT updated_at FROM users WHERE id = $1', [id]);
    await owner.query('SELECT pg_sleep(0.01)');
    await owner.query("UPDATE users SET display_name = 'Renamed' WHERE id = $1", [id]);
    const after = await owner.query('SELECT updated_at FROM users WHERE id = $1', [id]);
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });

  it('validates sessions: hash length, expiry, rotation pairing, revocation, unique hash', async () => {
    const userId = await insertUser();
    const insert = (o: Record<string, unknown> = {}) => {
      const q = insertSql('sessions', {
        user_id: userId,
        current_refresh_token_hash: bytes(32),
        expires_at: new Date(Date.now() + 86_400_000),
        ...o,
      });
      return owner.query(q.text, q.values);
    };
    await insert();
    await rejects(insert(), '23505', 'uq_sessions__current_hash');
    await rejects(
      insert({ current_refresh_token_hash: bytes(16, 2) }),
      '23514',
      'ck_sessions__hash_length',
    );
    await rejects(
      insert({
        current_refresh_token_hash: bytes(32, 3),
        expires_at: new Date(Date.now() - 86_400_000),
      }),
      '23514',
      'ck_sessions__expiry',
    );
    await rejects(
      insert({
        current_refresh_token_hash: bytes(32, 4),
        previous_refresh_token_hash: bytes(32, 5),
      }),
      '23514',
      'ck_sessions__rotation',
    );
    await rejects(
      insert({ current_refresh_token_hash: bytes(32, 6), revoked_at: new Date() }),
      '23514',
      'ck_sessions__revocation',
    );
    await rejects(
      insert({
        current_refresh_token_hash: bytes(32, 7),
        revoked_at: new Date(),
        revoked_reason: 'bored',
      }),
      '23514',
      'ck_sessions__revoked_reason',
    );
    await rejects(
      insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        current_refresh_token_hash: bytes(32, 8),
      }),
      '23503',
      'fk_sessions__user',
    );
  });

  it('keeps one outstanding reset token per user and checks hash length and expiry', async () => {
    const userId = await insertUser();
    const insert = (o: { hash?: Buffer; expires?: Date; usedAt?: Date | null } = {}) => {
      const q = insertSql('password_reset_tokens', {
        user_id: userId,
        token_hash: o.hash ?? bytes(32),
        expires_at: o.expires ?? new Date(Date.now() + 1_800_000),
        used_at: o.usedAt ?? null,
      });
      return owner.query(q.text, q.values);
    };
    await insert();
    await rejects(
      insert({ hash: bytes(32, 2) }),
      '23505',
      'uq_password_reset_tokens__user_outstanding',
    );
    await insert({ hash: bytes(32, 3), usedAt: new Date() });
    await rejects(
      insert({ hash: bytes(8, 4), usedAt: new Date() }),
      '23514',
      'ck_password_reset_tokens__hash_length',
    );
    await rejects(
      insert({ hash: bytes(32, 5), usedAt: new Date(), expires: new Date(Date.now() - 1000) }),
      '23514',
      'ck_password_reset_tokens__expiry',
    );
  });

  it('blocks deleting a user that still has sessions (ON DELETE RESTRICT, SQLSTATE 23503)', async () => {
    const userId = await insertUser();
    await owner.query(
      "INSERT INTO sessions (user_id, current_refresh_token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')",
      [userId, bytes(32)],
    );
    await rejects(
      owner.query('DELETE FROM users WHERE id = $1', [userId]),
      // PostgreSQL reports RESTRICT as foreign_key_violation (23503), not restrict_violation (23001).
      '23503',
      'fk_sessions__user',
    );
  });

  it('grants midas_app data access but no TRUNCATE (privilege matrix)', async () => {
    const tables = [
      'users',
      'sessions',
      'password_reset_tokens',
      'wallets',
      'categories',
      'transfers',
      'transactions',
    ];
    const rows = await owner.query<{ t: string; priv: string; ok: boolean }>(
      `SELECT t, priv, has_table_privilege('midas_app', 'public.' || t, priv) AS ok
       FROM unnest($1::text[]) AS t,
            unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS priv`,
      [tables],
    );
    expect(rows.rows).toHaveLength(tables.length * 5);
    for (const row of rows.rows) {
      expect(row.ok, row.t + ' ' + row.priv).toBe(row.priv !== 'TRUNCATE');
    }
  });

  it('rolls back every migration from create-auth-tables onwards and re-applies them', async () => {
    const connection = { connectionString: dbTestInfo()!.ownerUrl };
    const files = await listMigrationFiles();
    const auth = files.findIndex((name) => name.endsWith('_create-auth-tables'));
    const expected = files.slice(auth).reverse();
    const reverted = await runMigrations({ connection, direction: 'down', count: expected.length });
    expect(reverted).toEqual(expected);
    const probe = `SELECT to_regclass('public.users') AS users, to_regclass('public.sessions') AS sessions,
                          to_regclass('public.wallets') AS wallets, to_regclass('public.categories') AS categories,
                          to_regclass('public.transfers') AS transfers, to_regclass('public.transactions') AS transactions`;
    const gone = await owner.query(probe);
    expect(Object.values(gone.rows[0]).every((v) => v === null)).toBe(true);
    const fns = await owner.query(`SELECT proname FROM pg_proc WHERE proname = ANY($1::text[])`, [
      [
        'apply_wallet_balance',
        'assert_transfer_pair',
        'assert_category_accessible',
        'forbid_category_owner_change',
      ],
    ]);
    expect(fns.rowCount).toBe(0);

    await runMigrations({ connection, direction: 'up' });
    const back = await owner.query(probe);
    expect(back.rows[0]).toEqual({
      users: 'users',
      sessions: 'sessions',
      wallets: 'wallets',
      categories: 'categories',
      transfers: 'transfers',
      transactions: 'transactions',
    });
  });

  it('resets wallet ledger balances when the ledger migration is reverted, so up starts clean', async () => {
    const connection = { connectionString: dbTestInfo()!.ownerUrl };
    const files = await listMigrationFiles();
    const ledgerIndex = files.findIndex((name) =>
      name.endsWith('_create-transfers-and-transactions'),
    );
    const count = files.length - ledgerIndex;
    const userId = await insertUser();
    const wallet = await owner.query<{ id: string }>(
      `INSERT INTO wallets (user_id, name, type, currency) VALUES ($1, 'Cash', 'cash', 'USD')
       RETURNING id`,
      [userId],
    );
    const walletId = wallet.rows[0]!.id;
    await owner.query(
      `INSERT INTO transactions (user_id, wallet_id, type, category_id, amount_minor, currency, occurred_on)
       SELECT $1, $2, 'expense', id, 1234, 'USD', DATE '2026-10-01'
         FROM categories WHERE system_key = 'expense.groceries'`,
      [userId, walletId],
    );
    const balance = async () =>
      (
        await owner.query<{ b: string }>(
          'SELECT ledger_balance_minor::text AS b FROM wallets WHERE id = $1',
          [walletId],
        )
      ).rows[0]!.b;
    expect(await balance()).toBe('-1234');

    try {
      await runMigrations({ connection, direction: 'down', count });
      expect(await balance()).toBe('0');
    } finally {
      await runMigrations({ connection, direction: 'up' });
    }
    expect(await balance()).toBe('0');
  });

  it('migrate:verify proves up, down to zero and up again give identical catalogs', async () => {
    const name = 'midas_verify_' + randomBytes(4).toString('hex');
    await owner.query('CREATE DATABASE ' + name);
    try {
      const url = new URL(dbTestInfo()!.ownerUrl);
      url.pathname = '/' + name;
      const result = await verifyMigrations({ connectionString: url.toString() });
      expect(result.migrations).toBeGreaterThanOrEqual(2);
    } finally {
      await owner.query('DROP DATABASE IF EXISTS ' + name + ' WITH (FORCE)');
    }
  });
});
