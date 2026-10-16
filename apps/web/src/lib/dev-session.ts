import type { AuthSession } from '@midas/shared';

/**
 * Fake admin session for local UI work without an API. Only reachable when the dev server runs
 * with VITE_DEV_SKIP_AUTH=true; the guard in routes.tsx is a compile-time constant that is false
 * in production builds, so this module is dropped from the bundle.
 */
export const DEV_SESSION: AuthSession = {
  accessToken: 'dev-only-not-a-real-token',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'dev@example.com',
    displayName: 'Dev Admin',
    role: 'admin',
    status: 'active',
    preferences: { currency: 'USD', locale: 'en-US', timezone: 'UTC', theme: 'system' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};
