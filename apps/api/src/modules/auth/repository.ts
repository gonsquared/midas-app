import type { Preferences, Role, UserStatus } from '@midas/shared';
import type { DbHandle } from '../../platform/db/client.js';

export interface NewUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  preferences: Omit<Preferences, 'theme'>;
}

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  preferences: Preferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithPassword extends UserRecord {
  passwordHash: string;
}

export interface ProfilePatch {
  displayName?: string;
  currency?: string;
  locale?: string;
  timezone?: string;
  theme?: Preferences['theme'];
}

export interface NewSession {
  id: string;
  userId: string;
  refreshTokenHash: Buffer;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export type RevokeReason =
  'logout' | 'password_changed' | 'password_reset' | 'suspended' | 'reuse_detected';

/** A session found by refresh token hash, with the owner status. */
export interface SessionLookup {
  id: string;
  userId: string;
  userStatus: UserStatus;
  currentRefreshTokenHash: Buffer;
  previousRefreshTokenHash: Buffer | null;
  rotatedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Everything the per-request guard needs (AP-02). */
export interface ActiveSession {
  sessionId: string;
  userId: string;
  role: Role;
  preferences: Preferences;
}

export interface UsersRepository {
  /** Throws a PG unique violation on `uq_users__email` when the email exists. */
  insert(user: NewUser): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserWithPassword | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** Plain read of the credential (no lock). */
  findPasswordHash(id: string): Promise<string | null>;
  /** Locks the row and returns the credential, so concurrent password changes serialize. */
  findPasswordHashForUpdate(id: string): Promise<string | null>;
  markLoggedIn(id: string, now: Date): Promise<void>;
  updateProfile(id: string, patch: ProfilePatch): Promise<UserRecord>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
}

export interface SessionsRepository {
  insert(session: NewSession): Promise<void>;
  findByRefreshHash(hash: Buffer): Promise<SessionLookup | null>;
  /** Looks a session up by id (taken from the refresh token) for reuse detection. */
  findById(sessionId: string): Promise<SessionLookup | null>;
  /** Compare-and-swap rotation (database design C-04). Returns false when the token lost the race. */
  rotate(input: {
    sessionId: string;
    presentedHash: Buffer;
    newHash: Buffer;
    now: Date;
    expiresAt: Date;
  }): Promise<boolean>;
  /** Rotates again for a superseded token presented inside the grace window. */
  rotateWithinGrace(input: {
    sessionId: string;
    presentedHash: Buffer;
    newHash: Buffer;
    now: Date;
    graceStart: Date;
    expiresAt: Date;
  }): Promise<boolean>;
  /** Returns true when a live session was revoked; idempotent. */
  revoke(sessionId: string, reason: RevokeReason, now: Date): Promise<boolean>;
  /** Revokes every live session of the user, optionally keeping one. Returns the count. */
  revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    now: Date,
    exceptSessionId?: string,
  ): Promise<number>;
  findActive(sessionId: string, userId: string, now: Date): Promise<ActiveSession | null>;
}

export interface PasswordResetTokensRepository {
  /** Removes the unused tokens of a user, so a new request invalidates earlier ones. */
  deleteOutstanding(userId: string): Promise<void>;
  insert(input: { userId: string; tokenHash: Buffer; expiresAt: Date }): Promise<void>;
  /** True while the token exists, is unused and unexpired. Does not consume it. */
  isValid(tokenHash: Buffer, now: Date): Promise<boolean>;
  /** Marks a valid token used with one guarded UPDATE and returns its user, or null. */
  consume(tokenHash: Buffer, now: Date): Promise<string | null>;
}

export interface AuthRepositories {
  users: UsersRepository;
  sessions: SessionsRepository;
  resetTokens: PasswordResetTokensRepository;
}

/** Runs `fn` atomically with repositories bound to one transaction (services own transactions). */
export type AuthUnitOfWork = <T>(fn: (repos: AuthRepositories) => Promise<T>) => Promise<T>;

const USER_COLUMNS = [
  'id',
  'email',
  'displayName',
  'role',
  'status',
  'currency',
  'locale',
  'timezone',
  'theme',
  'createdAt',
  'updatedAt',
] as const;

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  currency: string;
  locale: string;
  timezone: string;
  theme: Preferences['theme'];
  createdAt: Date;
  updatedAt: Date;
}

function toPreferences(
  row: Pick<UserRow, 'currency' | 'locale' | 'timezone' | 'theme'>,
): Preferences {
  return {
    currency: row.currency as Preferences['currency'],
    locale: row.locale as Preferences['locale'],
    timezone: row.timezone,
    theme: row.theme,
  };
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    preferences: toPreferences(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createUsersRepository(db: DbHandle): UsersRepository {
  const findById = async (id: string): Promise<UserRecord | null> => {
    const row = await db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toUserRecord(row) : null;
  };

  return {
    async insert(user) {
      const row = await db
        .insertInto('users')
        .values({
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
          displayName: user.displayName,
          currency: user.preferences.currency,
          locale: user.preferences.locale,
          timezone: user.preferences.timezone,
        })
        .returning(USER_COLUMNS)
        .executeTakeFirstOrThrow();
      return toUserRecord(row);
    },

    async findByEmail(email) {
      const row = await db
        .selectFrom('users')
        .select([...USER_COLUMNS, 'passwordHash'])
        .where('email', '=', email)
        .executeTakeFirst();
      return row ? { ...toUserRecord(row), passwordHash: row.passwordHash } : null;
    },

    findById,

    async findPasswordHash(id) {
      const row = await db
        .selectFrom('users')
        .select('passwordHash')
        .where('id', '=', id)
        .executeTakeFirst();
      return row?.passwordHash ?? null;
    },

    async findPasswordHashForUpdate(id) {
      const row = await db
        .selectFrom('users')
        .select('passwordHash')
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      return row?.passwordHash ?? null;
    },

    async markLoggedIn(id, now) {
      await db.updateTable('users').set({ lastLoginAt: now }).where('id', '=', id).execute();
    },

    async updateProfile(id, patch) {
      // Only allowlisted columns are ever set.
      const values = {
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.currency !== undefined && { currency: patch.currency }),
        ...(patch.locale !== undefined && { locale: patch.locale }),
        ...(patch.timezone !== undefined && { timezone: patch.timezone }),
        ...(patch.theme !== undefined && { theme: patch.theme }),
      };
      if (Object.keys(values).length > 0) {
        await db.updateTable('users').set(values).where('id', '=', id).execute();
      }
      const user = await findById(id);
      if (!user) throw new Error('user disappeared during profile update');
      return user;
    },

    async updatePassword(id, passwordHash) {
      await db.updateTable('users').set({ passwordHash }).where('id', '=', id).execute();
    },
  };
}

function sessionLookupQuery(db: DbHandle) {
  return db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.userId')
    .select([
      'sessions.id',
      'sessions.userId',
      'users.status as userStatus',
      'sessions.currentRefreshTokenHash',
      'sessions.previousRefreshTokenHash',
      'sessions.rotatedAt',
      'sessions.createdAt',
      'sessions.expiresAt',
      'sessions.revokedAt',
    ]);
}

export function createSessionsRepository(db: DbHandle): SessionsRepository {
  return {
    async insert(session) {
      await db
        .insertInto('sessions')
        .values({
          id: session.id,
          userId: session.userId,
          currentRefreshTokenHash: session.refreshTokenHash,
          expiresAt: session.expiresAt,
          userAgent: session.userAgent,
          ip: session.ip,
        })
        .execute();
    },

    async findByRefreshHash(hash) {
      const row = await sessionLookupQuery(db)
        .where((eb) =>
          eb.or([
            eb('sessions.currentRefreshTokenHash', '=', hash),
            eb('sessions.previousRefreshTokenHash', '=', hash),
          ]),
        )
        .executeTakeFirst();
      return row ?? null;
    },

    async findById(sessionId) {
      const row = await sessionLookupQuery(db)
        .where('sessions.id', '=', sessionId)
        .executeTakeFirst();
      return row ?? null;
    },

    async rotate({ sessionId, presentedHash, newHash, now, expiresAt }) {
      const row = await db
        .updateTable('sessions')
        .set((eb) => ({
          previousRefreshTokenHash: eb.ref('currentRefreshTokenHash'),
          currentRefreshTokenHash: newHash,
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt,
        }))
        .where('id', '=', sessionId)
        .where('currentRefreshTokenHash', '=', presentedHash)
        .where('revokedAt', 'is', null)
        .where('expiresAt', '>', now)
        .returning('id')
        .executeTakeFirst();
      return row !== undefined;
    },

    async rotateWithinGrace({ sessionId, presentedHash, newHash, now, graceStart, expiresAt }) {
      const row = await db
        .updateTable('sessions')
        .set((eb) => ({
          previousRefreshTokenHash: eb.ref('currentRefreshTokenHash'),
          currentRefreshTokenHash: newHash,
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt,
        }))
        .where('id', '=', sessionId)
        .where('previousRefreshTokenHash', '=', presentedHash)
        .where('rotatedAt', '>=', graceStart)
        .where('revokedAt', 'is', null)
        .where('expiresAt', '>', now)
        .returning('id')
        .executeTakeFirst();
      return row !== undefined;
    },

    async revoke(sessionId, reason, now) {
      const row = await db
        .updateTable('sessions')
        .set({ revokedAt: now, revokedReason: reason })
        .where('id', '=', sessionId)
        .where('revokedAt', 'is', null)
        .returning('id')
        .executeTakeFirst();
      return row !== undefined;
    },

    async revokeAllForUser(userId, reason, now, exceptSessionId) {
      let query = db
        .updateTable('sessions')
        .set({ revokedAt: now, revokedReason: reason })
        .where('userId', '=', userId)
        .where('revokedAt', 'is', null);
      if (exceptSessionId !== undefined) query = query.where('id', '<>', exceptSessionId);
      const rows = await query.returning('id').execute();
      return rows.length;
    },

    async findActive(sessionId, userId, now) {
      const row = await db
        .selectFrom('sessions')
        .innerJoin('users', 'users.id', 'sessions.userId')
        .select([
          'sessions.id as sessionId',
          'users.id as userId',
          'users.role',
          'users.currency',
          'users.locale',
          'users.timezone',
          'users.theme',
        ])
        .where('sessions.id', '=', sessionId)
        .where('sessions.userId', '=', userId)
        .where('sessions.revokedAt', 'is', null)
        .where('sessions.expiresAt', '>', now)
        .where('users.status', '=', 'active')
        .executeTakeFirst();
      if (!row) return null;
      return {
        sessionId: row.sessionId,
        userId: row.userId,
        role: row.role,
        preferences: toPreferences(row),
      };
    },
  };
}

export function createPasswordResetTokensRepository(db: DbHandle): PasswordResetTokensRepository {
  return {
    async deleteOutstanding(userId) {
      await db
        .deleteFrom('passwordResetTokens')
        .where('userId', '=', userId)
        .where('usedAt', 'is', null)
        .execute();
    },

    async insert({ userId, tokenHash, expiresAt }) {
      await db.insertInto('passwordResetTokens').values({ userId, tokenHash, expiresAt }).execute();
    },

    async isValid(tokenHash, now) {
      const row = await db
        .selectFrom('passwordResetTokens')
        .select('id')
        .where('tokenHash', '=', tokenHash)
        .where('usedAt', 'is', null)
        .where('expiresAt', '>', now)
        .executeTakeFirst();
      return row !== undefined;
    },

    async consume(tokenHash, now) {
      const row = await db
        .updateTable('passwordResetTokens')
        .set({ usedAt: now })
        .where('tokenHash', '=', tokenHash)
        .where('usedAt', 'is', null)
        .where('expiresAt', '>', now)
        .returning('userId')
        .executeTakeFirst();
      return row?.userId ?? null;
    },
  };
}
