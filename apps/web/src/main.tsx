import '@midas/shared/zod-config';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@/app/error-boundary';
import { AppProviders } from '@/app/providers';
import { createAppRouter } from '@/app/router';
import { setSessionExpiredHandler, setSessionUserChangedHandler } from '@/lib/api-client';
import { DEFAULT_RETURN_PATH, safeReturnPath } from '@/lib/redirect';
import { createQueryClient } from '@/lib/query-client';
import './styles/index.css';

const queryClient = createQueryClient();
const router = createAppRouter();

// Forced sign-out (refresh rejected): drop cached data and go to sign-in, remembering where the
// user was (validated again on the way back).
setSessionExpiredHandler(() => {
  queryClient.clear();
  const back = safeReturnPath(router.state.location.href);
  void router.navigate({
    to: '/login',
    search:
      back === DEFAULT_RETURN_PATH ? { reason: 'expired' } : { reason: 'expired', redirect: back },
  });
});

// A refresh handed back a different user: drop everything cached for the previous one.
setSessionUserChangedHandler(() => {
  queryClient.clear();
  void router.navigate({ to: '/dashboard' });
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders queryClient={queryClient}>
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
