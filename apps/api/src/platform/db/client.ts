import { CamelCasePlugin, Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import type { Config } from '../config.js';
import type { Database } from './database.js';
import { isPgError } from './errors.js';
import { pgTypes } from './pg-types.js';

export type DbHandle = Kysely<Database> | Transaction<Database>;

export interface DatabaseClient {
  db: Kysely<Database>;
  pool: pg.Pool;
}

export interface PoolSettings {
  url: string;
  poolMax: number;
  statementTimeoutMs: number;
  ssl: 'off' | 'require' | 'verify-full';
  sslCa?: string | undefined;
  applicationName?: string;
  /** Called for idle-client errors; wire to a warn-level logger. */
  onPoolError?: (info: { code: string | undefined; message: string }) => void;
}

function sslOption(ssl: PoolSettings['ssl'], ca: string | undefined): pg.PoolConfig['ssl'] {
  if (ssl === 'off') return false;
  if (ssl === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

export function poolSettingsFromConfig(config: Config): PoolSettings {
  return {
    url: config.database.url,
    poolMax: config.database.poolMax,
    statementTimeoutMs: config.database.statementTimeoutMs,
    ssl: config.database.ssl,
    sslCa: config.database.sslCa,
  };
}

/**
 * Session settings sent in the connection startup packet (`options`), so they are in force
 * before the first query and there is no fire-and-forget SET that could reject unhandled.
 */
export function sessionOptions(statementTimeoutMs: number): string {
  return [
    '-c TimeZone=UTC',
    `-c statement_timeout=${Math.trunc(statementTimeoutMs)}`,
    '-c idle_in_transaction_session_timeout=60000',
    '-c lock_timeout=5000',
  ].join(' ');
}

/**
 * One pool per process (database design notes 13.4). Session settings travel as startup options.
 * The pool is created lazily by pg, so building a client never opens a connection.
 */
export function createDatabaseClient(settings: PoolSettings): DatabaseClient {
  const pool = new pg.Pool({
    connectionString: settings.url,
    max: settings.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: sslOption(settings.ssl, settings.sslCa),
    types: pgTypes,
    application_name: settings.applicationName ?? 'midas-api',
    options: sessionOptions(settings.statementTimeoutMs),
  });

  // Fallback for poolers or servers that ignore startup options. Queued ahead of any caller
  // query on this client. A rejection must never go unhandled (it would crash the process):
  // report it and drop the connection so a client without the settings is never used.
  pool.on('connect', (client) => {
    client
      .query(
        `SET TIME ZONE 'UTC'; SET statement_timeout = ${Math.trunc(settings.statementTimeoutMs)}; ` +
          `SET idle_in_transaction_session_timeout = '60s'; SET lock_timeout = '5s'`,
      )
      .catch((error: Error) => {
        settings.onPoolError?.({
          code: (error as { code?: unknown }).code as string | undefined,
          message: error.message,
        });
        client.end().catch(() => undefined);
      });
  });
  // An idle client error must not crash the process; the pool discards the client. Only the
  // SQLSTATE and message are reported (never detail, which can contain row data).
  pool.on('error', (error) => {
    settings.onPoolError?.({
      code: (error as { code?: unknown }).code as string | undefined,
      message: error.message,
    });
  });

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
  return { db, pool };
}

const RETRYABLE_SQLSTATES = new Set(['40P01', '40001']);

export interface TransactionOptions {
  retries?: number;
  /** Test seam; defaults to a jittered exponential backoff. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs `fn` in a transaction and retries on deadlock (40P01) or serialization failure (40001)
 * up to `retries` times (default 3). Other errors propagate unchanged.
 */
export async function withTransaction<T>(
  db: Kysely<Database>,
  fn: (trx: Transaction<Database>) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction().execute(fn);
    } catch (error) {
      if (attempt >= retries || !isPgError(error) || !RETRYABLE_SQLSTATES.has(error.code)) {
        throw error;
      }
      await sleep(Math.round(2 ** attempt * 25 * (0.5 + Math.random())));
    }
  }
}
