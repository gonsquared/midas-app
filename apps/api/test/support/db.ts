import pg from 'pg';
import { describe, inject } from 'vitest';
import { createDatabaseClient, type DatabaseClient } from '../../src/platform/db/client.js';

export function dbTestInfo() {
  return inject('dbTest');
}

/** `describe` that is skipped (see the global setup warning) when no database is available. */
export const describeDb = dbTestInfo() ? describe : describe.skip;

const TABLES = ['password_reset_tokens', 'sessions', 'users'];

export function ownerPool(): pg.Pool {
  const info = dbTestInfo();
  if (!info) throw new Error('Database tests are unavailable');
  return new pg.Pool({ connectionString: info.ownerUrl, max: 2 });
}

/** App-role client, identical privileges to production. */
export function appClient(): DatabaseClient {
  const info = dbTestInfo();
  if (!info) throw new Error('Database tests are unavailable');
  return createDatabaseClient({
    url: info.appUrl,
    poolMax: 4,
    statementTimeoutMs: 15_000,
    ssl: 'off',
  });
}

/** One TRUNCATE over every table so foreign keys are satisfied without CASCADE. */
export async function truncateAll(owner: pg.Pool): Promise<void> {
  await owner.query(`TRUNCATE ${TABLES.join(', ')}`);
}
