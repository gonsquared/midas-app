import type {
  AdminUser,
  AdminUserDetail,
  AdminUserPage,
  ListAdminUsersQuery,
  Role,
} from '@midas/shared';
import type { Kysely } from 'kysely';
import type { Clock } from '../../platform/clock.js';
import { withTransaction, type DbHandle } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { lockAdminSet } from '../../platform/db/locks.js';
import { AppError } from '../../platform/errors.js';
import type { AuditContext, AuditService } from '../audit/service.js';
import { createSessionsRepository } from '../auth/repository.js';
import {
  createAdminUsersRepository,
  type AdminUserDetailRow,
  type AdminUserRow,
  type AdminUsersRepository,
} from './users-repository.js';

const notFound = () => new AppError('NOT_FOUND', 'The requested resource was not found.');
const cannotModifySelf = () =>
  new AppError('CANNOT_MODIFY_SELF', 'You cannot change your own role or status.');
const lastAdmin = () =>
  new AppError('LAST_ADMIN', 'At least one active administrator must remain.');
const forbidden = () =>
  new AppError('FORBIDDEN', 'You do not have permission to perform this action.');

export function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    suspendedAt: row.suspendedAt ? row.suspendedAt.toISOString() : null,
  };
}

export function toAdminUserDetail(row: AdminUserDetailRow): AdminUserDetail {
  return {
    ...toAdminUser(row),
    suspendedReason: row.suspendedReason,
    activeSessionCount: row.activeSessionCount,
  };
}

export interface AdminActor {
  userId: string;
}

export interface AdminUsersDeps {
  db: Kysely<Database>;
  clock: Clock;
  audit: AuditService;
}

/**
 * Admin user management (api-contract 13). Only the `users` table, session revocation and the
 * audit log are touched: no wallet, transaction, budget or template is ever read (ADR-018).
 * Every state change runs under the admin-set advisory lock (C-06) and writes its audit row in
 * the same transaction (C-07).
 */
export class AdminUsersService {
  constructor(private readonly deps: AdminUsersDeps) {}

  async list(query: ListAdminUsersQuery): Promise<AdminUserPage> {
    const { rows, total } = await createAdminUsersRepository(this.deps.db).list(query);
    return {
      items: rows.map(toAdminUser),
      page: query.page,
      pageSize: query.pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async get(userId: string): Promise<AdminUserDetail> {
    return this.detail(this.deps.db, userId);
  }

  async suspend(
    actor: AdminActor,
    userId: string,
    reason: string | undefined,
    context: AuditContext,
  ): Promise<AdminUserDetail> {
    if (actor.userId === userId) throw cannotModifySelf();
    return withTransaction(this.deps.db, async (trx) => {
      const { repo, target } = await this.lockTarget(trx, userId);
      if (target.status === 'suspended') return this.detail(trx, userId); // idempotent
      if (target.role === 'admin') await this.assertAnotherActiveAdmin(repo, userId);
      await this.assertActorIsAdmin(repo, actor.userId);

      const now = this.deps.clock.now();
      await repo.setSuspended(userId, now, reason ?? null);
      // C-08: the sessions end in the same transaction as the status change.
      const revoked = await createSessionsRepository(trx).revokeAllForUser(
        userId,
        'suspended',
        now,
      );
      await this.deps.audit.recordIn(trx, {
        actorUserId: actor.userId,
        action: 'admin.user_suspended',
        targetType: 'user',
        targetId: userId,
        metadata: { sessionsRevoked: revoked, hasReason: reason !== undefined },
        context,
      });
      return this.detail(trx, userId);
    });
  }

  async reactivate(
    actor: AdminActor,
    userId: string,
    context: AuditContext,
  ): Promise<AdminUserDetail> {
    if (actor.userId === userId) throw cannotModifySelf();
    return withTransaction(this.deps.db, async (trx) => {
      const { repo, target } = await this.lockTarget(trx, userId);
      if (target.status === 'active') return this.detail(trx, userId); // idempotent
      await this.assertActorIsAdmin(repo, actor.userId);
      await repo.setActive(userId);
      await this.deps.audit.recordIn(trx, {
        actorUserId: actor.userId,
        action: 'admin.user_reactivated',
        targetType: 'user',
        targetId: userId,
        context,
      });
      return this.detail(trx, userId);
    });
  }

  async changeRole(
    actor: AdminActor,
    userId: string,
    role: Role,
    context: AuditContext,
  ): Promise<AdminUserDetail> {
    if (actor.userId === userId) throw cannotModifySelf();
    return withTransaction(this.deps.db, async (trx) => {
      const { repo, target } = await this.lockTarget(trx, userId);
      if (target.role === role) return this.detail(trx, userId); // idempotent
      // Only an active admin counts toward the admin set, so demoting a suspended one is safe.
      if (target.role === 'admin' && target.status === 'active') {
        await this.assertAnotherActiveAdmin(repo, userId);
      }
      await this.assertActorIsAdmin(repo, actor.userId);
      await repo.setRole(userId, role);
      await this.deps.audit.recordIn(trx, {
        actorUserId: actor.userId,
        action: 'admin.user_role_changed',
        targetType: 'user',
        targetId: userId,
        metadata: { from: target.role, to: role },
        context,
      });
      return this.detail(trx, userId);
    });
  }

  /** Admin-set lock first (C-06), then the target row; 404 for an unknown id. */
  private async lockTarget(trx: DbHandle, userId: string) {
    await lockAdminSet(trx);
    const repo = createAdminUsersRepository(trx);
    const target = await repo.lockById(userId);
    if (!target) throw notFound();
    return { repo, target };
  }

  private async assertAnotherActiveAdmin(
    repo: AdminUsersRepository,
    targetId: string,
  ): Promise<void> {
    if ((await repo.countActiveAdminsExcluding(targetId)) === 0) throw lastAdmin();
  }

  /** The caller was an admin when the request started; re-check under the lock. */
  private async assertActorIsAdmin(repo: AdminUsersRepository, actorId: string): Promise<void> {
    if (!(await repo.isActiveAdmin(actorId))) throw forbidden();
  }

  private async detail(db: DbHandle, userId: string): Promise<AdminUserDetail> {
    const row = await createAdminUsersRepository(db).findDetail(userId, this.deps.clock.now());
    if (!row) throw notFound();
    return toAdminUserDetail(row);
  }
}
