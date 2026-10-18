import { sql, type Kysely } from 'kysely';
import type { Clock } from '../../platform/clock.js';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { tryLockHousekeeping } from '../../platform/db/locks.js';
import type { ScheduledTask } from '../../platform/scheduler.js';

const DAY_MS = 86_400_000;
const SESSION_RETENTION_DAYS = 30;
const BATCH = 5_000;

export interface HousekeepingResult {
  sessions: number;
  resetTokens: number;
}

/**
 * Daily housekeeping (AP-17): expired or revoked sessions 30 days after the fact, and reset tokens
 * one day after they expired. Every batch of `batch` rows (default 5000) is its own short
 * transaction under the try-lock, so with several instances only one runs it, no transaction or
 * lock is held for the whole purge, and a failure keeps the batches already committed. Returns
 * null when another instance holds the lock before anything was deleted.
 */
export async function runHousekeeping(
  db: Kysely<Database>,
  clock: Clock,
  batch: number = BATCH,
): Promise<HousekeepingResult | null> {
  const now = clock.now();
  const sessionCutoff = new Date(now.getTime() - SESSION_RETENTION_DAYS * DAY_MS);
  const tokenCutoff = new Date(now.getTime() - DAY_MS);
  const result: HousekeepingResult = { sessions: 0, resetTokens: 0 };

  /** One batch in its own transaction; null when the lock is held elsewhere. */
  const step = (kind: 'sessions' | 'resetTokens') =>
    withTransaction(db, async (trx) => {
      if (!(await tryLockHousekeeping(trx))) return null;
      const deleted =
        kind === 'sessions'
          ? await sql`
              delete from sessions where id in (
                select id from sessions
                 where expires_at < ${sessionCutoff} or revoked_at < ${sessionCutoff}
                 limit ${batch})`.execute(trx)
          : await sql`
              delete from password_reset_tokens where ctid in (
                select ctid from password_reset_tokens
                 where expires_at < ${tokenCutoff}
                 limit ${batch})`.execute(trx);
      return Number(deleted.numAffectedRows ?? 0);
    });

  let first = true;
  for (const kind of ['sessions', 'resetTokens'] as const) {
    for (;;) {
      const count = await step(kind);
      if (count === null) return first ? null : result;
      first = false;
      result[kind] += count;
      if (count < batch) break;
    }
  }
  return result;
}

/** Scheduler task that runs housekeeping at most once per `everyMs` (default 24 h). */
export function housekeepingTask(deps: {
  db: Kysely<Database>;
  clock: Clock;
  logger: { info(obj: Record<string, unknown>, msg: string): void };
  everyMs?: number;
  /** Replaceable in tests. */
  run?: typeof runHousekeeping;
}): ScheduledTask {
  let lastRun = 0;
  return {
    name: 'housekeeping',
    async run() {
      const now = deps.clock.now().getTime();
      if (now - lastRun < (deps.everyMs ?? DAY_MS)) return;
      // Only a finished run moves the schedule: a failure (it throws to the scheduler, which logs
      // it) or a busy lock is retried on the next tick instead of waiting a whole day.
      const result = await (deps.run ?? runHousekeeping)(deps.db, deps.clock);
      if (result) {
        lastRun = now;
        deps.logger.info({ ...result }, 'housekeeping finished');
      }
    },
  };
}
