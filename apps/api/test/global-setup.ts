import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/platform/db/migrate.js';

export interface DbTestInfo {
  /** Owner role: runs DDL, truncation and fixtures. */
  ownerUrl: string;
  /** `midas_app` role: the same privileges as production (database design notes 16.1). */
  appUrl: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbTest: DbTestInfo | null;
  }
}

const IMAGE = process.env.TEST_DATABASE_IMAGE ?? 'postgres:17-bookworm';

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function prepareDatabase(
  adminUrl: string,
): Promise<{ info: DbTestInfo; cleanup: () => Promise<void> }> {
  const database = `midas_test_${randomBytes(4).toString('hex')}`;
  const appPassword = randomBytes(12).toString('hex');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    // Roles are cluster-level; create them before migration 1 so default privileges apply.
    await admin.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'midas_app') THEN
          CREATE ROLE midas_app LOGIN PASSWORD '${appPassword}';
        ELSE
          ALTER ROLE midas_app LOGIN PASSWORD '${appPassword}';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'midas_maintenance') THEN
          CREATE ROLE midas_maintenance NOLOGIN;
        END IF;
      END $$`);
    await admin.query(`GRANT CONNECT ON DATABASE ${database} TO midas_app`);
  } finally {
    await admin.end();
  }

  const ownerUrl = withDatabase(adminUrl, database);
  await runMigrations({ connection: { connectionString: ownerUrl }, direction: 'up' });

  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    await owner.query('GRANT USAGE ON SCHEMA public TO midas_app');
  } finally {
    await owner.end();
  }

  const appUrl = new URL(ownerUrl);
  appUrl.username = 'midas_app';
  appUrl.password = appPassword;

  return {
    info: { ownerUrl, appUrl: appUrl.toString() },
    cleanup: async () => {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
  };
}

/**
 * One PostgreSQL 17 per test run (database design notes 16.2). Order of preference:
 *   1. TEST_DATABASE_URL: an existing server (for example the Compose db) used as an admin
 *      connection; a throwaway database is created on it and dropped afterwards.
 *   2. Testcontainers, when a Docker daemon is reachable.
 * If neither is available, database tests are skipped with a clear message instead of failing.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  try {
    let adminUrl = process.env.TEST_DATABASE_URL;
    if (!adminUrl) {
      container = await new PostgreSqlContainer(IMAGE).start();
      adminUrl = container.getConnectionUri();
    }
    const prepared = await prepareDatabase(adminUrl);
    cleanup = prepared.cleanup;
    project.provide('dbTest', prepared.info);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : 'unknown error';
    console.warn(
      '\n[db-tests] SKIPPED: no PostgreSQL available for integration tests.\n' +
        '  Start Docker (Testcontainers) or set TEST_DATABASE_URL to a PostgreSQL 17 admin URL.\n' +
        `  Reason: ${reason}\n`,
    );
    project.provide('dbTest', null);
    await container?.stop().catch(() => undefined);
    container = undefined;
  }

  return async () => {
    await cleanup?.().catch(() => undefined);
    await container?.stop().catch(() => undefined);
  };
}
