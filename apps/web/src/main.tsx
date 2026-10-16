import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@/app/error-boundary';
import { AppProviders } from '@/app/providers';
import { createAppRouter } from '@/app/router';
import { setSessionExpiredHandler } from '@/lib/api-client';
import { createQueryClient } from '@/lib/query-client';
import './styles/index.css';

const queryClient = createQueryClient();
const router = createAppRouter();

// Forced sign-out (refresh rejected): drop cached data and go to sign-in.
setSessionExpiredHandler(() => {
  queryClient.clear();
  void router.navigate({ to: '/login' });
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
