import type { AuthSession } from '@midas/shared';
import { api } from '@/lib/api-client';
import { authSessionParser } from '@/lib/api-schemas';
import { clearSession, setSession } from '@/lib/session';

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await api.request('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
    parser: authSessionParser,
  });
  setSession(session);
  return session;
}

/** Always clears local state, even if the network call fails. */
export async function logout(): Promise<void> {
  try {
    await api.request('/auth/logout', { method: 'POST', auth: false, csrf: true });
  } finally {
    clearSession();
  }
}

/** Restores a session from the httpOnly refresh cookie (page reload). Null means signed out. */
export function restoreSession(): Promise<AuthSession | null> {
  return api.refresh();
}
