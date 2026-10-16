import type { Role, Theme, UserStatus } from '@midas/shared';
import type { DB, Generated, Timestamp, Users as GeneratedUsers } from './database.generated.js';

/**
 * Narrows `text` enum columns to the unions exported by `@midas/shared`
 * (database design notes 3.1). The CHECK-vs-enum parity test keeps both in step.
 */
export interface UsersTable extends Omit<
  GeneratedUsers,
  'role' | 'status' | 'theme' | 'createdAt' | 'updatedAt'
> {
  role: Generated<Role>;
  status: Generated<UserStatus>;
  theme: Generated<Theme>;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}

export interface Database extends Omit<DB, 'users'> {
  users: UsersTable;
}
