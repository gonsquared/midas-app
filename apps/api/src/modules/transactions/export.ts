import { Readable } from 'node:stream';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../platform/db/database.js';
import { CSV_BOM, csvHeader, transactionCsvLine } from './csv.js';
import { buildExportQuery, type TransactionFilters } from './list-query.js';

/** Rows fetched per round trip of the server-side cursor (database design AP-08). */
const FETCH_SIZE = 500;
/** Output is flushed to the socket in chunks of about this many characters. */
const FLUSH_CHARS = 32 * 1024;

/**
 * Streams the filtered transactions as CSV with constant memory: a READ ONLY transaction holds a
 * server-side cursor, rows are read in batches of 500 and written as they are produced, and the
 * response applies backpressure. Destroying the stream (the client disconnected) rolls the
 * transaction back and closes the cursor, so a dropped download never leaks a connection.
 * The 120 s statement timeout covers each fetch; the pool's idle-in-transaction timeout ends an
 * export whose client stops reading for a minute.
 */
export function streamTransactionsCsv(
  db: Kysely<Database>,
  userId: string,
  query: TransactionFilters,
): Readable {
  async function* generate(): AsyncGenerator<Buffer> {
    const trx = await db.startTransaction().setAccessMode('read only').execute();
    let finished = false;
    try {
      await sql`set local statement_timeout = '120s'`.execute(trx);
      let buffer = CSV_BOM + csvHeader();
      for await (const row of buildExportQuery(trx, userId, query).stream(FETCH_SIZE)) {
        buffer += transactionCsvLine(row);
        if (buffer.length >= FLUSH_CHARS) {
          yield Buffer.from(buffer, 'utf8');
          buffer = '';
        }
      }
      if (buffer.length > 0) yield Buffer.from(buffer, 'utf8');
      await trx.commit().execute();
      finished = true;
    } finally {
      if (!finished)
        await trx
          .rollback()
          .execute()
          .catch(() => undefined);
    }
  }
  return Readable.from(generate(), { objectMode: false });
}

export interface ExportGateOptions {
  /** Concurrent exports per process, across all users. */
  max: number;
  /** Concurrent exports per user. */
  perUser?: number;
  /** Absolute time cap per export; `onExpire` runs when it is exceeded. */
  maxDurationMs?: number;
}

/**
 * Caps concurrent exports per process and per user (default 1), so neither a handful of long
 * downloads nor one user with several tabs can take every pooled connection (the pool defaults to
 * 10). Each export also has an absolute time cap, so a client that trickles bytes (never idle
 * long enough for the idle-in-transaction timeout) cannot hold a slot and a connection forever.
 * `acquire` returns a release function, or null when the process or the user is at its limit.
 */
export class ExportGate {
  private active = 0;
  private readonly byUser = new Map<string, number>();
  private readonly perUser: number;
  private readonly maxDurationMs: number | undefined;
  private readonly max: number;

  constructor(options: number | ExportGateOptions) {
    const o = typeof options === 'number' ? { max: options } : options;
    this.max = o.max;
    this.perUser = o.perUser ?? 1;
    this.maxDurationMs = o.maxDurationMs;
  }

  acquire(userId: string, onExpire?: () => void): (() => void) | null {
    const mine = this.byUser.get(userId) ?? 0;
    if (this.active >= this.max || mine >= this.perUser) return null;
    this.active += 1;
    this.byUser.set(userId, mine + 1);
    const timer =
      this.maxDurationMs !== undefined && onExpire
        ? setTimeout(onExpire, this.maxDurationMs)
        : undefined;
    timer?.unref();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (timer) clearTimeout(timer);
      this.active -= 1;
      const left = (this.byUser.get(userId) ?? 1) - 1;
      if (left <= 0) this.byUser.delete(userId);
      else this.byUser.set(userId, left);
    };
  }
}
