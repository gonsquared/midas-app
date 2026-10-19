import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { clearSession, getSessionSnapshot, markSignedOutByUser } from '@/lib/session';
import { logout } from './api';
import { listenForSignOut } from './session-broadcast';
import type { AuthReason } from './strings';

/** Revokes the session, clears memory and cached data, then lands on sign-in. */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    let reason: AuthReason = 'signed-out';
    try {
      await logout();
    } catch {
      // The local session is cleared and restore is blocked; tell the user the server may not
      // have ended its session.
      reason = 'signout-failed';
    }
    queryClient.clear();
    await router.navigate({ to: '/login', search: { reason } });
  }, [queryClient, router]);
}

/** Signs this tab out too when another tab signs out (BroadcastChannel "midas-session"). */
export function useCrossTabSignOut(): void {
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(
    () =>
      listenForSignOut(() => {
        if (getSessionSnapshot().user === null) return;
        markSignedOutByUser();
        clearSession();
        queryClient.clear();
        void router.navigate({ to: '/login', search: { reason: 'signed-out' } });
      }),
    [queryClient, router],
  );
}
