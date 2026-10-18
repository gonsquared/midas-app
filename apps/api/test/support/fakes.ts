import type { PasswordHasher } from '../../src/modules/auth/password-hasher.js';
import type {
  ActiveSession,
  AuthRepositories,
  AuthUnitOfWork,
  NewSession,
  NewUser,
  RevokeReason,
  SessionLookup,
  UserRecord,
} from '../../src/modules/auth/repository.js';

export const fakeHasher: PasswordHasher = {
  hash: async (password) => `$argon2id$v=19$fake$${Buffer.from(password).toString('base64')}`,
  verify: async (hash, password) => hash.endsWith(Buffer.from(password).toString('base64')),
};

export function uniqueViolation(constraint: string): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint,
  });
}

export interface FakeUser extends NewUser {
  createdAt: Date;
  updatedAt: Date;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  theme: 'light' | 'dark' | 'system';
  lastLoginAt: Date | null;
}

export interface FakeSession extends NewSession {
  createdAt: Date;
  previousRefreshTokenHash: Buffer | null;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: RevokeReason | null;
}

export interface FakeResetToken {
  userId: string;
  tokenHash: Buffer;
  expiresAt: Date;
  usedAt: Date | null;
}

const DEFAULT_NOW = new Date('2026-10-16T08:30:00.000Z');

/**
 * In-memory stand-in for the auth repositories with the same rules as the database: unique email,
 * compare-and-swap rotation, revocation. `clock` supplies created timestamps.
 */
export function createFakeAuth(clock: { now(): Date } = { now: () => DEFAULT_NOW }) {
  const users: FakeUser[] = [];
  const sessions: FakeSession[] = [];
  const resetTokens: FakeResetToken[] = [];
  let failNextSessionInsert: Error | undefined;

  const record = (user: FakeUser): UserRecord => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    preferences: { ...user.preferences, theme: user.theme },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
  const sameHash = (a: Buffer | null, b: Buffer) => a !== null && a.equals(b);

  const toLookup = (session: FakeSession): SessionLookup => ({
    id: session.id,
    userId: session.userId,
    userStatus: users.find((u) => u.id === session.userId)?.status ?? 'active',
    currentRefreshTokenHash: session.refreshTokenHash,
    previousRefreshTokenHash: session.previousRefreshTokenHash,
    rotatedAt: session.rotatedAt,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
  });

  const userRepository: AuthRepositories['users'] = {
    async insert(user) {
      if (users.some((u) => u.email === user.email)) throw uniqueViolation('uq_users__email');
      const now = clock.now();
      const created: FakeUser = {
        ...user,
        createdAt: now,
        updatedAt: now,
        role: 'user',
        status: 'active',
        theme: 'system',
        lastLoginAt: null,
      };
      users.push(created);
      return record(created);
    },
    async findByEmail(email) {
      const user = users.find((u) => u.email === email);
      return user ? { ...record(user), passwordHash: user.passwordHash } : null;
    },
    async findById(id) {
      const user = users.find((u) => u.id === id);
      return user ? record(user) : null;
    },
    async findPasswordHash(id) {
      return users.find((u) => u.id === id)?.passwordHash ?? null;
    },
    async findPasswordHashForUpdate(id) {
      return users.find((u) => u.id === id)?.passwordHash ?? null;
    },
    async markLoggedIn(id, now) {
      const user = users.find((u) => u.id === id);
      if (user) user.lastLoginAt = now;
    },
    async updateProfile(id, patch) {
      const user = users.find((u) => u.id === id);
      if (!user) throw new Error('no such user');
      if (patch.displayName !== undefined) user.displayName = patch.displayName;
      if (patch.currency !== undefined) user.preferences.currency = patch.currency as never;
      if (patch.locale !== undefined) user.preferences.locale = patch.locale as never;
      if (patch.timezone !== undefined) user.preferences.timezone = patch.timezone;
      if (patch.theme !== undefined) user.theme = patch.theme;
      return record(user);
    },
    async updatePassword(id, passwordHash) {
      const user = users.find((u) => u.id === id);
      if (user) user.passwordHash = passwordHash;
    },
  };

  const sessionRepository: AuthRepositories['sessions'] = {
    async insert(session) {
      if (failNextSessionInsert) {
        const error = failNextSessionInsert;
        failNextSessionInsert = undefined;
        throw error;
      }
      sessions.push({
        ...session,
        createdAt: clock.now(),
        previousRefreshTokenHash: null,
        rotatedAt: null,
        revokedAt: null,
        revokedReason: null,
      });
    },
    async findByRefreshHash(hash) {
      const session = sessions.find(
        (s) => sameHash(s.refreshTokenHash, hash) || sameHash(s.previousRefreshTokenHash, hash),
      );
      return session ? toLookup(session) : null;
    },
    async findById(sessionId) {
      const session = sessions.find((s) => s.id === sessionId);
      return session ? toLookup(session) : null;
    },
    async rotate({ sessionId, presentedHash, newHash, now, expiresAt }) {
      const s = sessions.find((x) => x.id === sessionId);
      if (!s || !s.refreshTokenHash.equals(presentedHash) || s.revokedAt || s.expiresAt <= now) {
        return false;
      }
      s.previousRefreshTokenHash = s.refreshTokenHash;
      s.refreshTokenHash = newHash;
      s.rotatedAt = now;
      s.expiresAt = expiresAt;
      return true;
    },
    async rotateWithinGrace({ sessionId, presentedHash, newHash, now, graceStart, expiresAt }) {
      const s = sessions.find((x) => x.id === sessionId);
      if (
        !s ||
        !sameHash(s.previousRefreshTokenHash, presentedHash) ||
        !s.rotatedAt ||
        s.rotatedAt < graceStart ||
        s.revokedAt ||
        s.expiresAt <= now
      ) {
        return false;
      }
      s.previousRefreshTokenHash = s.refreshTokenHash;
      s.refreshTokenHash = newHash;
      s.rotatedAt = now;
      s.expiresAt = expiresAt;
      return true;
    },
    async revoke(sessionId, reason, now) {
      const s = sessions.find((x) => x.id === sessionId);
      if (!s || s.revokedAt) return false;
      s.revokedAt = now;
      s.revokedReason = reason;
      return true;
    },
    async revokeAllForUser(userId, reason, now, exceptSessionId) {
      let count = 0;
      for (const s of sessions) {
        if (s.userId === userId && !s.revokedAt && s.id !== exceptSessionId) {
          s.revokedAt = now;
          s.revokedReason = reason;
          count++;
        }
      }
      return count;
    },
    async findActive(sessionId, userId, now) {
      const s = sessions.find((x) => x.id === sessionId && x.userId === userId);
      const user = users.find((u) => u.id === userId);
      if (!s || !user || s.revokedAt || s.expiresAt <= now || user.status !== 'active') return null;
      const active: ActiveSession = {
        sessionId: s.id,
        userId,
        role: user.role,
        preferences: { ...user.preferences, theme: user.theme },
      };
      return active;
    },
  };

  const resetTokenRepository: AuthRepositories['resetTokens'] = {
    async deleteOutstanding(userId) {
      for (let i = resetTokens.length - 1; i >= 0; i--) {
        if (resetTokens[i]?.userId === userId && resetTokens[i]?.usedAt === null) {
          resetTokens.splice(i, 1);
        }
      }
    },
    async insert({ userId, tokenHash, expiresAt }) {
      resetTokens.push({ userId, tokenHash, expiresAt, usedAt: null });
    },
    async isValid(tokenHash, now) {
      return resetTokens.some(
        (t) => t.tokenHash.equals(tokenHash) && t.usedAt === null && t.expiresAt > now,
      );
    },
    async consume(tokenHash, now) {
      const t = resetTokens.find(
        (x) => x.tokenHash.equals(tokenHash) && x.usedAt === null && x.expiresAt > now,
      );
      if (!t) return null;
      t.usedAt = now;
      return t.userId;
    },
  };

  const repositories: AuthRepositories = {
    users: userRepository,
    sessions: sessionRepository,
    resetTokens: resetTokenRepository,
  };

  const unitOfWork: AuthUnitOfWork = async (fn) => {
    const snapshot = {
      users: users.map((u) => ({ ...u, preferences: { ...u.preferences } })),
      sessions: sessions.map((s) => ({ ...s })),
      resetTokens: resetTokens.map((t) => ({ ...t })),
    };
    try {
      return await fn(repositories);
    } catch (error) {
      // Emulate rollback.
      users.splice(0, users.length, ...snapshot.users);
      sessions.splice(0, sessions.length, ...snapshot.sessions);
      resetTokens.splice(0, resetTokens.length, ...snapshot.resetTokens);
      throw error;
    }
  };

  return {
    users,
    sessions,
    resetTokens,
    repositories,
    unitOfWork,
    failNextSessionInsert(error: Error) {
      failNextSessionInsert = error;
    },
  };
}
