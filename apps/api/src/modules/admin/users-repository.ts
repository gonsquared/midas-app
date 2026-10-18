import type { AdminUserSort, ListAdminUsersQuery, Role, UserStatus } from '@midas/shared';
import { sql, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { escapeLike } from '../transactions/repository.js';

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
  suspendedAt: Date | null;
}

export interface AdminUserDetailRow extends AdminUserRow {
  suspendedReason: string | null;
  activeSessionCount: number;
}

/** Explicit column list: the password hash is never selected by an admin query (database design 10.3). */
const LIST_COLUMNS = [
  'id',
  'email',
  'displayName',
  'role',
  'status',
  'createdAt',
  'lastLoginAt',
  'suspendedAt',
] as const;

/** Fixed map from the validated sort enum to ORDER BY columns; never built from user input. */
const SORTS: Record<
  AdminUserSort,
  Array<{
    column: 'createdAt' | 'email' | 'lastLoginAt' | 'id';
    direction: 'asc' | 'desc';
    nullsLast?: true;
  }>
> = {
  createdAt_desc: [
    { column: 'createdAt', direction: 'desc' },
    { column: 'id', direction: 'desc' },
  ],
  createdAt_asc: [
    { column: 'createdAt', direction: 'asc' },
    { column: 'id', direction: 'asc' },
  ],
  email_asc: [
    { column: 'email', direction: 'asc' },
    { column: 'id', direction: 'asc' },
  ],
  lastLoginAt_desc: [
    { column: 'lastLoginAt', direction: 'desc', nullsLast: true },
    { column: 'id', direction: 'asc' },
  ],
};

export function createAdminUsersRepository(db: DbHandle) {
  /** Shared WHERE for the page query and the count query (parameterized; LIKE text escaped). */
  const conditions = (query: ListAdminUsersQuery) => (eb: ExpressionBuilder<Database, 'users'>) => {
    const parts: Expression<SqlBool>[] = [];
    if (query.role !== undefined) parts.push(eb('role', '=', query.role));
    if (query.status !== undefined) parts.push(eb('status', '=', query.status));
    if (query.q !== undefined) {
      const pattern = `%${escapeLike(query.q)}%`;
      parts.push(sql<boolean>`(email ilike ${pattern} or display_name ilike ${pattern})`);
    }
    return eb.and(parts);
  };

  return {
    /** AP-13: filtered, sorted page plus the total count for the same filter. */
    async list(query: ListAdminUsersQuery): Promise<{ rows: AdminUserRow[]; total: number }> {
      let select = db.selectFrom('users').select(LIST_COLUMNS).where(conditions(query));
      for (const order of SORTS[query.sort]) {
        select = select.orderBy(order.column, (ob) => {
          const ordered = order.direction === 'desc' ? ob.desc() : ob.asc();
          return order.nullsLast ? ordered.nullsLast() : ordered;
        });
      }
      const [rows, count] = await Promise.all([
        select
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize)
          .execute(),
        db
          .selectFrom('users')
          .select(sql<number>`count(*)::int`.as('n'))
          .where(conditions(query))
          .executeTakeFirstOrThrow(),
      ]);
      return { rows, total: count.n };
    },

    async findDetail(id: string, now: Date): Promise<AdminUserDetailRow | null> {
      const row = await db
        .selectFrom('users')
        .select([...LIST_COLUMNS, 'suspendedReason'])
        .select((eb) =>
          eb
            .selectFrom('sessions')
            .select(sql<number>`count(*)::int`.as('n'))
            .whereRef('sessions.userId', '=', 'users.id')
            .where('sessions.revokedAt', 'is', null)
            .where('sessions.expiresAt', '>', now)
            .as('activeSessionCount'),
        )
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? { ...row, activeSessionCount: row.activeSessionCount ?? 0 } : null;
    },

    /** Row lock for a role or status change. The admin-set advisory lock is taken before this. */
    async lockById(id: string): Promise<{ id: string; role: Role; status: UserStatus } | null> {
      const row = await db
        .selectFrom('users')
        .select(['id', 'role', 'status'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      return row ?? null;
    },

    /** AP-16: active admins other than `excludeId`, through ix_users__active_admins. */
    async countActiveAdminsExcluding(excludeId: string): Promise<number> {
      const row = await db
        .selectFrom('users')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('role', '=', 'admin')
        .where('status', '=', 'active')
        .where('id', '<>', excludeId)
        .executeTakeFirstOrThrow();
      return row.n;
    },

    async isActiveAdmin(id: string): Promise<boolean> {
      const row = await db
        .selectFrom('users')
        .select('id')
        .where('id', '=', id)
        .where('role', '=', 'admin')
        .where('status', '=', 'active')
        .executeTakeFirst();
      return row !== undefined;
    },

    async setSuspended(id: string, now: Date, reason: string | null): Promise<void> {
      await db
        .updateTable('users')
        .set({ status: 'suspended', suspendedAt: now, suspendedReason: reason })
        .where('id', '=', id)
        .execute();
    },

    async setActive(id: string): Promise<void> {
      await db
        .updateTable('users')
        .set({ status: 'active', suspendedAt: null, suspendedReason: null })
        .where('id', '=', id)
        .execute();
    },

    async setRole(id: string, role: Role): Promise<void> {
      await db.updateTable('users').set({ role }).where('id', '=', id).execute();
    },
  };
}

export type AdminUsersRepository = ReturnType<typeof createAdminUsersRepository>;
