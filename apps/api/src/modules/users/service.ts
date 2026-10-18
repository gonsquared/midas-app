import type { UpdateProfileRequest, User } from '@midas/shared';
import { AppError } from '../../platform/errors.js';
import type { AuthRepositories, ProfilePatch } from '../auth/repository.js';
import { toUserDto } from '../auth/service.js';

export class ProfileService {
  constructor(private readonly repositories: AuthRepositories) {}

  async get(userId: string): Promise<User> {
    const user = await this.repositories.users.findById(userId);
    // The guard just loaded this user, so a miss means it was deleted concurrently.
    if (!user) throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
    return toUserDto(user);
  }

  /**
   * Applies an allowlisted partial update. Currency, locale and time zone were validated against
   * the supported lists at the API boundary. Email and role are not part of the schema.
   */
  async update(userId: string, input: UpdateProfileRequest): Promise<User> {
    const patch: ProfilePatch = {
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.preferences?.currency !== undefined && { currency: input.preferences.currency }),
      ...(input.preferences?.locale !== undefined && { locale: input.preferences.locale }),
      ...(input.preferences?.timezone !== undefined && { timezone: input.preferences.timezone }),
      ...(input.preferences?.theme !== undefined && { theme: input.preferences.theme }),
    };
    return toUserDto(await this.repositories.users.updateProfile(userId, patch));
  }
}
