import pg from 'pg';
import { describe, inject } from 'vitest';
import { seedSystemCategories } from '../../db/seeds/system-categories.js';
import {
  createDatabaseClient,
  createKysely,
  type DatabaseClient,
} from '../../src/platform/db/client.js';

export function dbTestInfo() {
  return inject('dbTest');
}

/** `describe` that is skipped (see the global setup warning) when no database is available. */
export const describeDb = dbTestInfo() ? describe : describe.skip;

const TABLES = [
  'transactions',
  'transfers',
  'categories',
  'wallets',
  'password_reset_tokens',
  'sessions',
  'users',
];

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

/**
 * One TRUNCATE over every table so foreign keys are satisfied without CASCADE, then the system
 * category seed again, so every test starts from a migrated and seeded database (16.2).
 */
export async function truncateAll(owner: pg.Pool): Promise<void> {
  await owner.query(`TRUNCATE ${TABLES.join(', ')}`);
  await seedOwner(owner);
}

/** Runs `seed:system` through an existing owner pool (the pool stays open). */
export async function seedOwner(owner: pg.Pool): Promise<void> {
  await seedSystemCategories(createKysely(owner));
}
