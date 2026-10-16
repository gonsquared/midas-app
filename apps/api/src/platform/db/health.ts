import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from './database.js';

/** Resolves true when `SELECT 1` succeeds within the timeout (database design notes 13.5). */
export async function checkDatabase(db: Kysely<Database>, timeoutMs = 1000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    const probe = sql`select 1`.execute(db).then(
      () => true as const,
      () => false as const,
    );
    return await Promise.race([probe, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
