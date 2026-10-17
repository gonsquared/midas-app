import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { clearSession, getSessionSnapshot } from '@/lib/session';
import { logout } from './api';
import { listenForSignOut } from './session-broadcast';

/** Revokes the session, clears memory and cached data, then lands on sign-in. */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    try {
      await logout();
    } catch {
      // The local session is already cleared; the server session expires on its own.
    } finally {
      queryClient.clear();
      await router.navigate({ to: '/login', search: { reason: 'signed-out' } });
    }
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
        clearSession();
        queryClient.clear();
        void router.navigate({ to: '/login', search: { reason: 'signed-out' } });
      }),
    [queryClient, router],
  );
}
