import { randomBytes } from 'node:crypto';
import { DisplayNameSchema } from '@midas/shared';
import { v7 as uuidv7 } from 'uuid';
import type { Kysely } from 'kysely';
import type { Clock } from '../../platform/clock.js';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { lockAdminSet } from '../../platform/db/locks.js';
import { argon2Hasher } from '../auth/password-hasher.js';
import { createAuditRepository } from '../audit/repository.js';
import { toAuditRow, type AuditEntry } from '../audit/service.js';
import { createAdminUsersRepository } from './users-repository.js';

/**
 * First-admin paths (ADR-013, database design 12.2). All of them hold the admin-set lock, so
 * concurrent boots of several instances cannot both bootstrap, and write their audit row in the
 * same transaction with a null actor (system).
 */
export type PromoteOutcome = 'promoted' | 'already_admin' | 'user_not_found';
export type BootstrapOutcome = 'created' | 'admin_exists' | 'email_taken';

export interface BootstrapDeps {
  db: Kysely<Database>;
  clock: Clock;
}

async function audit(
  trx: Parameters<typeof createAuditRepository>[0],
  clock: Clock,
  entry: AuditEntry,
): Promise<void> {
  await createAuditRepository(trx).insert(toAuditRow(entry, clock.now()));
}

/** `cli admin:promote`: makes an existing user an admin. Idempotent. */
export async function promoteUser(deps: BootstrapDeps, email: string): Promise<PromoteOutcome> {
  return withTransaction(deps.db, async (trx) => {
    await lockAdminSet(trx);
    const user = await trx
      .selectFrom('users')
      .select(['id', 'role'])
      .where('email', '=', email)
      .forUpdate()
      .executeTakeFirst();
    if (!user) return 'user_not_found';
    if (user.role === 'admin') return 'already_admin';
    await createAdminUsersRepository(trx).setRole(user.id, 'admin');
    await audit(trx, deps.clock, {
      actorUserId: null,
      action: 'admin.user_role_changed',
      targetType: 'user',
      targetId: user.id,
      metadata: { from: 'user', to: 'admin', via: 'cli' },
    });
    return 'promoted';
  });
}

/**
 * `cli admin:create`: creates a brand-new admin account. It never touches an existing account:
 * registration does not verify email ownership, so promoting "whoever holds this email" would let
 * a pre-registered account (and its known password) become admin. An existing email returns
 * `email_exists`; promoting it is the explicit, audited `admin:promote` operator action. The
 * existence check runs inside the transaction under the admin-set lock and the insert relies on
 * the unique email index, so a concurrent registration cannot slip in between check and insert.
 */
export async function createAdmin(
  deps: BootstrapDeps,
  input: { email: string; displayName: string; passwordHash: string },
): Promise<'created' | 'email_exists'> {
  return withTransaction(deps.db, async (trx) => {
    await lockAdminSet(trx);
    const id = uuidv7();
    const inserted = await trx
      .insertInto('users')
      .values({
        id,
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        role: 'admin',
      })
      .onConflict((oc) => oc.column('email').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) return 'email_exists';
    await audit(trx, deps.clock, {
      actorUserId: null,
      action: 'system.admin_bootstrapped',
      targetType: 'user',
      targetId: id,
      metadata: { via: 'cli' },
    });
    return 'created';
  });
}

/**
 * `BOOTSTRAP_ADMIN_EMAIL` at boot, only while no admin exists. It never promotes an existing
 * account (email ownership is unverified at registration): if the email is already taken it
 * refuses (`email_taken`, the caller logs loudly) and the operator must use `admin:promote`.
 * Otherwise it creates the account itself with an unusable random password; the owner sets a real
 * one through the password-reset email, which proves control of the mailbox.
 */
export async function bootstrapAdminFromEnv(
  deps: BootstrapDeps,
  email: string,
): Promise<BootstrapOutcome> {
  const passwordHash = await argon2Hasher.hash(randomBytes(32).toString('base64url'));
  const displayName = DisplayNameSchema.safeParse(email.split('@')[0] ?? '');
  return withTransaction(deps.db, async (trx) => {
    await lockAdminSet(trx);
    const admin = await trx
      .selectFrom('users')
      .select('id')
      .where('role', '=', 'admin')
      .limit(1)
      .executeTakeFirst();
    if (admin) return 'admin_exists';
    const id = uuidv7();
    const inserted = await trx
      .insertInto('users')
      .values({
        id,
        email,
        passwordHash,
        displayName: displayName.success ? displayName.data : 'Administrator',
        role: 'admin',
      })
      .onConflict((oc) => oc.column('email').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) return 'email_taken';
    await audit(trx, deps.clock, {
      actorUserId: null,
      action: 'system.admin_bootstrapped',
      targetType: 'user',
      targetId: id,
      metadata: { via: 'env' },
    });
    return 'created';
  });
}
