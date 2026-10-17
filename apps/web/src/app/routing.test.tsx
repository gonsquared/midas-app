import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { getSessionSnapshot } from '@/lib/session';
import {
  makeAuthSession,
  renderApp,
  setViewport,
  signedInAs,
  stubRefresh,
  VIEWPORT,
} from '@/test/helpers';

describe('route guards', () => {
  it('sends a signed-out visitor to sign in when the refresh cookie is not valid', async () => {
    setViewport(VIEWPORT.desktop);
    const fetchMock = stubRefresh(null);
    const { router } = await renderApp('/transactions');
    expect(router.state.location.pathname).toBe('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    // The protected-route guard tries the cookie, and so does the sign-in page it lands on.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('restores the session from the refresh cookie and keeps the token in memory only', async () => {
    setViewport(VIEWPORT.desktop);
    stubRefresh(makeAuthSession('user'));
    const { router } = await renderApp('/transactions');
    expect(router.state.location.pathname).toBe('/transactions');
    expect(await screen.findByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
    expect(getSessionSnapshot().user?.displayName).toBe('Kim Morgan');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('test-access');
  });

  it('redirects the root to the dashboard when signed in', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const { router } = await renderApp('/');
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('renders every placeholder route', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('admin');
    const routes: Array<[string, string]> = [
      ['/dashboard', 'Dashboard'],
      ['/transactions', 'Transactions'],
      ['/wallets', 'Wallets'],
      ['/categories', 'Categories'],
      ['/budgets', 'Budgets'],
      ['/recurring', 'Recurring'],
      ['/reports', 'Reports'],
      ['/settings', 'Settings'],
      ['/admin', 'Administration'],
    ];
    for (const [path, title] of routes) {
      const { unmount } = await renderApp(path);
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      unmount();
    }
  });
});

describe('not found and admin gating', () => {
  it('shows the 404 page for unknown paths', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    await renderApp('/nope/at/all');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('shows the same 404 for /admin to non-admins', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    await renderApp('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('sign out', () => {
  it('clears the in-memory session and lands on sign in', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    stubRefresh(null);
    const user = userEvent.setup();
    const { router } = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });

    await user.click(screen.getByRole('button', { name: /Account menu for Kim Morgan/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSessionSnapshot().user).toBeNull();
  });
});
