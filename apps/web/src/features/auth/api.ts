import type { AuthSession } from '@midas/shared';
import { api } from '@/lib/api-client';
import { authSessionParser } from '@/lib/api-schemas';
import { clearSession, isSignedOutByUser, markSignedOutByUser, setSession } from '@/lib/session';
import { broadcastSignOut } from './session-broadcast';

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await api.request('/auth/login', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password },
    auth: false,
    parser: authSessionParser,
  });
  setSession(session);
  return session;
}

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  currency: string;
  locale: string;
  timezone: string;
}

export async function register(input: RegisterInput): Promise<AuthSession> {
  const session = await api.request('/auth/register', {
    method: 'POST',
    body: {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      displayName: input.displayName.trim(),
      currency: input.currency,
      locale: input.locale,
      timezone: input.timezone,
    },
    auth: false,
    parser: authSessionParser,
  });
  setSession(session);
  return session;
}

/**
 * Always clears local state, even if the network call fails (the error is still thrown so the
 * caller can say the server session may remain). The signed-out flag stops session restore from
 * using a still-valid refresh cookie until the user signs in again.
 */
export async function logout(): Promise<void> {
  try {
    await api.request('/auth/logout', { method: 'POST', auth: false, csrf: true });
  } finally {
    markSignedOutByUser();
    clearSession();
    broadcastSignOut();
  }
}

/**
 * Restores a session from the httpOnly refresh cookie (page reload). Null means signed out, which
 * is also the answer after an explicit sign-out in this page's lifetime.
 */
export async function restoreSession(): Promise<AuthSession | null> {
  if (isSignedOutByUser()) return null;
  return api.refresh();
}

/** The API answers 202 for known and unknown addresses alike. */
export async function requestPasswordReset(email: string): Promise<void> {
  await api.request('/auth/password/forgot', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() },
    auth: false,
  });
}

/** Resolves when the reset token is currently valid (it is not consumed). */
export async function verifyResetToken(token: string): Promise<void> {
  await api.request('/auth/password/reset/verify', {
    method: 'POST',
    body: { token },
    auth: false,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.request('/auth/password/reset', {
    method: 'POST',
    body: { token, newPassword },
    auth: false,
  });
  // A reset ends every session server-side; do not keep this tab's token around.
  clearSession();
}
