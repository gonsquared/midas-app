import { afterAll, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabaseClient } from '../../src/platform/db/client.js';
import { dbTestInfo, describeDb } from '../support/db.js';

describeDb('pool session settings (real PostgreSQL)', () => {
  const info = dbTestInfo();
  const client = createDatabaseClient({
    url: info?.appUrl ?? '',
    poolMax: 2,
    statementTimeoutMs: 4321,
    ssl: 'off',
  });
  afterAll(async () => {
    await client.db.destroy();
  });

  it('applies the configured session settings on every connection', async () => {
    const show = async (name: string) => {
      const { rows } = await sql<{ v: string }>`SELECT current_setting(${name}) AS v`.execute(
        client.db,
      );
      return rows[0]?.v;
    };
    expect(await show('statement_timeout')).toBe('4321ms');
    expect(await show('TimeZone')).toBe('UTC');
    expect(await show('lock_timeout')).toBe('5s');
    expect(await show('idle_in_transaction_session_timeout')).toBe('1min');
  });

  it('forwards idle pool errors without crashing', () => {
    const seen: unknown[] = [];
    const c = createDatabaseClient({
      url: 'postgres://u:p@127.0.0.1:1/x',
      poolMax: 1,
      statementTimeoutMs: 1000,
      ssl: 'off',
      onPoolError: (i) => seen.push(i),
    });
    c.pool.emit(
      'error',
      Object.assign(new Error('terminated'), { code: '57P01', detail: 'secret' }),
    );
    expect(seen).toEqual([{ code: '57P01', message: 'terminated' }]);
    return c.db.destroy();
  });
});
