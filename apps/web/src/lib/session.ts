import { useSyncExternalStore } from 'react';
import type { AuthSession, User } from '@midas/shared';

/**
 * In-memory session holder. The access token lives only in this module-scoped variable: never in
 * localStorage, sessionStorage or cookies readable by script. The refresh token is an httpOnly
 * cookie the browser manages; this code never sees it.
 */
export interface SessionSnapshot {
  readonly user: User | null;
}

let accessToken: string | null = null;
let snapshot: SessionSnapshot = { user: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot;
}

/**
 * Set when the user chose to sign out. The refresh cookie may still be valid (the revoke call can
 * fail), so session restore must not quietly sign them back in until they sign in again.
 */
let signedOutByUser = false;

export function markSignedOutByUser(): void {
  signedOutByUser = true;
}

/** Lets session restore run again (a successful sign-in does this itself; tests use it too). */
export function resetSignedOutByUser(): void {
  signedOutByUser = false;
}

export function isSignedOutByUser(): boolean {
  return signedOutByUser;
}

export function setSession(session: AuthSession): void {
  signedOutByUser = false;
  accessToken = session.accessToken;
  snapshot = { user: session.user };
  emit();
}

/** Replaces the signed-in user (profile or preference changes) without touching the token. */
export function updateSessionUser(user: User): void {
  snapshot = { user };
  emit();
}

/** Clears token and user from memory (logout, forced sign-out). */
export function clearSession(): void {
  accessToken = null;
  snapshot = { user: null };
  emit();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
}

export interface SessionStore {
  getAccessToken: () => string | null;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
  /** Id of the signed-in user, when known (used to detect a user switch on refresh). */
  getUserId?: () => string | null;
}

export const defaultSessionStore: SessionStore = {
  getAccessToken,
  setSession,
  clearSession,
  getUserId: () => snapshot.user?.id ?? null,
};
