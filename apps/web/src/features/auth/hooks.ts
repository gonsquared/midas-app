import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { logout } from './api';

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
      await router.navigate({ to: '/login' });
    }
  }, [queryClient, router]);
}
