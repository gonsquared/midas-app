import { hash, verify } from '@node-rs/argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

/**
 * argon2id (the library default) with m = 19 MiB, t = 2, p = 1 (architecture 9). Parameters are
 * embedded in the encoded hash, so they can be raised later without a migration.
 */
export const argon2Hasher: PasswordHasher = {
  hash: (password) => hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
  verify: async (passwordHash, password) => {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  },
};
