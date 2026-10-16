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

export interface NewSession {
  id: string;
  userId: string;
  refreshTokenHash: Buffer;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export interface UsersRepository {
  /** Throws a PG unique violation on `uq_users__email` when the email exists. */
  insert(user: NewUser): Promise<UserRecord>;
}

export interface SessionsRepository {
  insert(session: NewSession): Promise<void>;
}

export interface AuthRepositories {
  users: UsersRepository;
  sessions: SessionsRepository;
}

/** Runs `fn` atomically with repositories bound to one transaction (services own transactions). */
export type AuthUnitOfWork = <T>(fn: (repos: AuthRepositories) => Promise<T>) => Promise<T>;

export function createUsersRepository(db: DbHandle): UsersRepository {
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
        .returning([
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
        ])
        .executeTakeFirstOrThrow();
      return {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        role: row.role,
        status: row.status,
        preferences: {
          currency: row.currency as Preferences['currency'],
          locale: row.locale as Preferences['locale'],
          timezone: row.timezone,
          theme: row.theme,
        },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },
  };
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
  };
}
