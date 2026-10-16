import type { Kysely } from 'kysely';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import {
  createSessionsRepository,
  createUsersRepository,
  type AuthUnitOfWork,
} from './repository.js';

export function createAuthUnitOfWork(db: Kysely<Database>): AuthUnitOfWork {
  return (fn) =>
    withTransaction(db, (trx) =>
      fn({ users: createUsersRepository(trx), sessions: createSessionsRepository(trx) }),
    );
}
