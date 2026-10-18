import type { AuditAction, AuditTargetType } from '@midas/shared';
import { sql } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';

export interface AuditRow {
  id: string;
  occurredAt: Date;
  actorUserId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface NewAuditRow {
  id: string;
  occurredAt: Date;
  actorUserId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditFilters {
  actorUserId?: string | undefined;
  actions?: AuditAction[] | undefined;
  targetType?: AuditTargetType | undefined;
  targetId?: string | undefined;
  /** Inclusive lower bound (UTC midnight of the `from` day). */
  occurredFrom?: Date | undefined;
  /** Exclusive upper bound (UTC midnight after the `to` day). */
  occurredBefore?: Date | undefined;
  after?: { occurredAt: string; id: string } | undefined;
  limit: number;
}

/**
 * Append-only by construction (database design C-10): this repository has no update or delete
 * method, and the application database role has no such privilege either.
 */
export function createAuditRepository(db: DbHandle) {
  return {
    async insert(row: NewAuditRow): Promise<void> {
      await db
        .insertInto('auditLogs')
        .values({
          id: row.id,
          occurredAt: row.occurredAt,
          actorUserId: row.actorUserId,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          ip: row.ip,
          userAgent: row.userAgent,
          requestId: row.requestId,
          // pg serializes a JS object parameter as JSON text for the jsonb column
          metadata: JSON.stringify(row.metadata) as never,
        })
        .execute();
    },

    /** AP-14. Keyset on (occurred_at, id) descending; fetches `limit + 1` rows. */
    async query(filters: AuditFilters): Promise<AuditRow[]> {
      let q = db
        .selectFrom('auditLogs as a')
        .leftJoin('users as u', 'u.id', 'a.actorUserId')
        .select([
          'a.id',
          'a.occurredAt',
          'a.actorUserId',
          'u.email as actorEmail',
          'a.action',
          'a.targetType',
          'a.targetId',
          sql<string | null>`host(a.ip)`.as('ip'),
          'a.userAgent',
          'a.requestId',
          'a.metadata',
        ]);
      if (filters.actorUserId !== undefined) q = q.where('a.actorUserId', '=', filters.actorUserId);
      if (filters.actions) q = q.where('a.action', 'in', filters.actions);
      if (filters.targetType !== undefined) q = q.where('a.targetType', '=', filters.targetType);
      if (filters.targetId !== undefined) q = q.where('a.targetId', '=', filters.targetId);
      if (filters.occurredFrom) q = q.where('a.occurredAt', '>=', filters.occurredFrom);
      if (filters.occurredBefore) q = q.where('a.occurredAt', '<', filters.occurredBefore);
      if (filters.after) {
        q = q.where(
          sql<boolean>`(a.occurred_at, a.id) < (${filters.after.occurredAt}::timestamptz, ${filters.after.id}::uuid)`,
        );
      }
      const rows = await q
        .orderBy('a.occurredAt', 'desc')
        .orderBy('a.id', 'desc')
        .limit(filters.limit + 1)
        .execute();
      return rows.map((row) => ({ ...row, metadata: row.metadata as Record<string, unknown> }));
    },

    async findUserIdByEmail(email: string): Promise<string | null> {
      const row = await db
        .selectFrom('users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirst();
      return row?.id ?? null;
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
