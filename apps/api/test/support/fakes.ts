import type { PasswordHasher } from '../../src/modules/auth/password-hasher.js';
import type {
  AuthUnitOfWork,
  NewSession,
  NewUser,
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

/** In-memory stand-in for the auth repositories with the same uniqueness rule as the database. */
export function createFakeAuth() {
  const users: Array<NewUser & { createdAt: Date }> = [];
  const sessions: NewSession[] = [];
  let failNextSessionInsert: Error | undefined;

  const unitOfWork: AuthUnitOfWork = async (fn) => {
    const usersBefore = users.length;
    const sessionsBefore = sessions.length;
    try {
      return await fn({
        users: {
          async insert(user) {
            if (users.some((u) => u.email === user.email)) throw uniqueViolation('uq_users__email');
            const createdAt = new Date('2026-10-16T08:30:00.000Z');
            users.push({ ...user, createdAt });
            const record: UserRecord = {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              role: 'user',
              status: 'active',
              preferences: { ...user.preferences, theme: 'system' },
              createdAt,
              updatedAt: createdAt,
            };
            return record;
          },
        },
        sessions: {
          async insert(session) {
            if (failNextSessionInsert) {
              const error = failNextSessionInsert;
              failNextSessionInsert = undefined;
              throw error;
            }
            sessions.push(session);
          },
        },
      });
    } catch (error) {
      // Emulate rollback.
      users.length = usersBefore;
      sessions.length = sessionsBefore;
      throw error;
    }
  };

  return {
    users,
    sessions,
    unitOfWork,
    failNextSessionInsert(error: Error) {
      failNextSessionInsert = error;
    },
  };
}
