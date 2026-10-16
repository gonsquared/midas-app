import type { AuthSession } from '@midas/shared';
import { RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import { createAppRouter, createMemoryHistory } from '@/app/router';
import { createQueryClient } from '@/lib/query-client';
import { clearSession, setSession } from '@/lib/session';

export function makeAuthSession(role: 'user' | 'admin' = 'user'): AuthSession {
  return {
    accessToken: 'test-access-token',
    accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    user: {
      id: '3f2b8c1e-9d44-4a55-8f0c-0a1b2c3d4e5f',
      email: 'kim@example.com',
      displayName: 'Kim Morgan',
      role,
      status: 'active',
      preferences: { currency: 'USD', locale: 'en-US', timezone: 'UTC', theme: 'system' },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
  };
}

/** Makes matchMedia answer min-width queries for the given viewport width. */
export function setViewport(width: number): void {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = min ? width >= Number(min[1]) : false;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
}

export const VIEWPORT = { mobile: 390, tablet: 800, desktop: 1280 } as const;

export function signedInAs(role: 'user' | 'admin' = 'user'): void {
  clearSession();
  setSession(makeAuthSession(role));
}

/** Stubs fetch so the refresh-cookie call succeeds (session) or fails with 401 (null). */
export function stubRefresh(session: AuthSession | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    session
      ? new Response(JSON.stringify(session), { status: 200 })
      : new Response('{}', { status: 401 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export async function renderApp(path: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  const queryClient = createQueryClient();
  const utils = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  await router.load();
  return { router, ...utils };
}
