import type { User } from '@midas/shared';
import { api } from '@/lib/api-client';
import { userParser } from '@/lib/api-schemas';
import { updateSessionUser } from '@/lib/session';

export interface ProfilePatch {
  displayName?: string;
  preferences?: { currency?: string; locale?: string; timezone?: string; theme?: string };
}

/** PATCH /me. The returned user replaces the session user, so formatting updates everywhere. */
export async function updateProfile(patch: ProfilePatch): Promise<User> {
  const user = await api.request('/me', { method: 'PATCH', body: patch, parser: userParser });
  updateSessionUser(user);
  return user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.request('/me/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}
