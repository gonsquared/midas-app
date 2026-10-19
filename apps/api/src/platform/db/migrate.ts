import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import pg from 'pg';

export const MIGRATIONS_TABLE = 'schema_migrations';
/**
 * Source checkout: apps/api/db/migrations, three levels above this file. Production bundle
 * (apps/api/scripts/build.mjs): dist/db/migrations next to dist/cli.js, so that is checked first.
 */
function resolveMigrationsDir(): string {
  const bundled = fileURLToPath(new URL('./db/migrations', import.meta.url));
  return existsSync(bundled)
    ? bundled
    : fileURLToPath(new URL('../../../db/migrations', import.meta.url));
}

export const MIGRATIONS_DIR = resolveMigrationsDir();

const MIGRATION_FILE = /^(\d{17})_([a-z0-9]+(?:-[a-z0-9]+)*)\.(ts|js)$/;

export interface MigrationLogger {
  info(message: string): void;
  warn(message: string): void;
}

const silent: MigrationLogger = { info: () => undefined, warn: () => undefined };

export interface MigrateOptions {
  connection: pg.ClientConfig;
  direction: 'up' | 'down';
  /** Number of migrations; `up` defaults to all pending, `down` defaults to 1. */
  count?: number;
  logger?: MigrationLogger;
}

/**
 * Runs migrations through the node-pg-migrate programmatic runner with the settings from
 * database design notes 11.1: one transaction per migration, order check, advisory lock.
 */
export async function runMigrations(options: MigrateOptions): Promise<string[]> {
  const logger = options.logger ?? silent;
  const count = options.count ?? (options.direction === 'up' ? Infinity : 1);
  const done = await runner({
    databaseUrl: options.connection,
    dir: MIGRATIONS_DIR,
    migrationsTable: MIGRATIONS_TABLE,
    direction: options.direction,
    count,
    checkOrder: true,
    singleTransaction: false,
    // Fail fast instead of queueing behind another runner holding the advisory lock.
    advisoryLockMode: 'fail',
    log: (message: string) => logger.info(message),
    logger: {
      debug: () => undefined,
      info: (message: string) => logger.info(message),
      warn: (message: string) => logger.warn(message),
      error: (message: string) => logger.warn(message),
    },
  });
  return done.map((migration) => migration.name);
}

export interface MigrationStatusEntry {
  name: string;
  applied: boolean;
  runOn: Date | null;
}

export async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .map((file) => MIGRATION_FILE.exec(file))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => `${match[1]}_${match[2]}`)
    .sort();
}

export async function getMigrationStatus(
  connection: pg.ClientConfig,
): Promise<MigrationStatusEntry[]> {
  const files = await listMigrationFiles();
  const client = new pg.Client(connection);
  await client.connect();
  try {
    const exists = await client.query<{ present: boolean }>(
      `select to_regclass($1) is not null as present`,
      [MIGRATIONS_TABLE],
    );
    const applied = new Map<string, Date>();
    if (exists.rows[0]?.present) {
      const rows = await client.query<{ name: string; run_on: Date }>(
        `select name, run_on from ${MIGRATIONS_TABLE} order by id`,
      );
      for (const row of rows.rows) applied.set(row.name, row.run_on);
    }
    return files.map((name) => ({
      name,
      applied: applied.has(name),
      runOn: applied.get(name) ?? null,
    }));
  } finally {
    await client.end();
  }
}

/** Captures tables, columns, constraints, indexes, triggers, functions and extensions. */
export async function catalogSnapshot(connection: pg.ClientConfig): Promise<string> {
  const client = new pg.Client(connection);
  await client.connect();
  try {
    const q = async (text: string) => (await client.query(text)).rows;
    const snapshot = {
      extensions: await q(`select extname from pg_extension where extname <> 'plpgsql' order by 1`),
      columns: await q(`
        select table_name, column_name, data_type, udt_name, is_nullable, column_default,
               character_maximum_length, datetime_precision
        from information_schema.columns
        where table_schema = 'public' and table_name <> '${MIGRATIONS_TABLE}'
        order by table_name, column_name`),
      constraints: await q(`
        select conrelid::regclass::text as table_name, conname,
               pg_get_constraintdef(oid) as definition
        from pg_constraint
        where connamespace = 'public'::regnamespace and conrelid <> 0
          and conrelid::regclass::text <> '${MIGRATIONS_TABLE}'
        order by 1, 2`),
      indexes: await q(`
        select tablename, indexname, indexdef from pg_indexes
        where schemaname = 'public' and tablename <> '${MIGRATIONS_TABLE}'
        order by 1, 2`),
      triggers: await q(`
        select tgrelid::regclass::text as table_name, tgname,
               pg_get_triggerdef(oid) as definition
        from pg_trigger
        where not tgisinternal and tgrelid::regclass::text <> '${MIGRATIONS_TABLE}'
        order by 1, 2`),
      functions: await q(`
        select p.proname, pg_get_functiondef(p.oid) as definition
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by 1`),
    };
    return JSON.stringify(snapshot, null, 2);
  } finally {
    await client.end();
  }
}

export class VerifyError extends Error {}

/**
 * CI check (database design notes 11.1): up from empty, snapshot, down to zero, up again, and
 * require identical snapshots. Refuses to run on a database that already has migrations applied.
 */
export async function verifyMigrations(
  connection: pg.ClientConfig,
  logger?: MigrationLogger,
): Promise<{ migrations: number }> {
  const status = await getMigrationStatus(connection);
  if (status.some((entry) => entry.applied)) {
    throw new VerifyError('migrate:verify requires a database with no applied migrations');
  }
  const applied = await runMigrations({ connection, direction: 'up', ...(logger && { logger }) });
  const first = await catalogSnapshot(connection);
  await runMigrations({
    connection,
    direction: 'down',
    count: applied.length,
    ...(logger && { logger }),
  });
  const empty = await catalogSnapshot(connection);
  if (JSON.parse(empty).columns.length > 0) {
    throw new VerifyError('Down migrations left tables behind');
  }
  await runMigrations({ connection, direction: 'up', ...(logger && { logger }) });
  const second = await catalogSnapshot(connection);
  if (first !== second) {
    throw new VerifyError('Catalog differs after down and up: migrations are not reversible');
  }
  return { migrations: applied.length };
}
