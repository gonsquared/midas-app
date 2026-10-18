import { sql } from 'kysely';
import type { DbHandle } from './client.js';

/**
 * Advisory lock namespaces (database design 9.3). Two-integer form, held until the transaction
 * ends, so it works behind a transaction-mode pooler.
 */
export const LOCK_NAMESPACE = {
  walletLimit: 2,
  categoryLimit: 3,
} as const;

/** Serializes limit checks per user (for example the 100 wallet cap). Call inside a transaction. */
export async function lockUserScope(
  db: DbHandle,
  namespace: (typeof LOCK_NAMESPACE)[keyof typeof LOCK_NAMESPACE],
  userId: string,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(${namespace}::int, hashtext(${userId}::text))`.execute(db);
}
