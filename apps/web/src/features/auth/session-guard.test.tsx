import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getSessionSnapshot } from '@/lib/session';
import { resetPassword } from './api';
import { mockApi, noContent, ok, problem } from '@/test/mock-api';
import { makeAuthSession, renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';

describe('route guards and return path', () => {
  it('sends a signed-out visitor to sign in, then returns them after sign-in', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({
      'POST /auth/refresh': problem(401, 'SESSION_INVALID'),
      'POST /auth/login': ok(makeAuthSession()),
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/settings?x=1');
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/settings?x=1' });
    expect(api.callsTo('POST /auth/refresh')).toHaveLength(2);

    await user.type(await screen.findByLabelText('Email'), 'kim@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2-hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
  });

  it.each([
    '//evil.example',
    'https://evil.example/dashboard',
    'javascript:alert(1)',
    '/%2f%2fevil.example',
    '/not-a-route',
  ])('ignores the hostile return target %s', async (target) => {
    setViewport(VIEWPORT.desktop);
    mockApi({ 'POST /auth/login': ok(makeAuthSession()) });
    const user = userEvent.setup();
    const { router } = await renderApp(`/login?redirect=${encodeURIComponent(target)}`);
    await user.type(await screen.findByLabelText('Email'), 'kim@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2-hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(window.location.hostname).not.toBe('evil.example');
  });

  it('keeps a signed-in visitor off the sign-in screen', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    mockApi({});
    const { router } = await renderApp('/login');
    expect(router.state.location.pathname).toBe('/dashboard');
  });
});

describe('session restore on public screens', () => {
  it('sends a reloaded visitor with a valid refresh cookie from /login to the dashboard', async () => {
    setViewport(VIEWPORT.desktop);
    clearSession();
    const api = mockApi({ 'POST /auth/refresh': ok(makeAuthSession()) });
    const { router } = await renderApp('/login');
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(api.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('clears the in-memory session after a successful password reset', async () => {
    signedInAs('user');
    mockApi({ 'POST /auth/password/reset': noContent() });
    await resetPassword('token', 'a-Long-new-passphrase-42');
    expect(getSessionSnapshot().user).toBeNull();
  });
});

describe('logout', () => {
  it('revokes the session with the CSRF header, clears client state and says so', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const api = mockApi({ 'POST /auth/logout': noContent() });
    const user = userEvent.setup();
    const { router } = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: /Account menu for Kim Morgan/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(api.callsTo('POST /auth/logout')[0]?.headers.get('X-CSRF-Protection')).toBe('1');
    expect(getSessionSnapshot().user).toBeNull();
    expect(await screen.findByText('You have signed out.')).toBeVisible();
  });

  it('stays on sign-in and does not refresh with the still-valid cookie when logout fails', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const api = mockApi({
      'POST /auth/logout': problem(500, 'INTERNAL_ERROR'),
      'POST /auth/refresh': ok(makeAuthSession()),
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: /Account menu for Kim Morgan/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSessionSnapshot().user).toBeNull();
    expect(await screen.findByText(/could not reach the server to end your session/)).toBeVisible();
    await router.navigate({ to: '/login' });
    await router.navigate({ to: '/register' });
    expect(router.state.location.pathname).toBe('/register');
    expect(api.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('drops cached server data and keeps credentials out of web storage and script-readable cookies', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    mockApi({ 'POST /auth/logout': noContent() });
    const user = userEvent.setup();
    const { router, queryClient } = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    // Another user must never see the previous user's data after sign-out on a shared device.
    queryClient.setQueryData(['wallets', 'list'], { items: [{ name: 'Private wallet' }] });
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Account menu for Kim Morgan/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(getSessionSnapshot().user).toBeNull();
    const web = JSON.stringify({ ...localStorage, ...sessionStorage }) + document.cookie;
    expect(web).not.toContain('test-access');
    expect(web).not.toContain('kim@example.com');
  });
});

describe('transparent refresh', () => {
  it('refreshes an expired access token and retries the request without surfacing an error', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    let walletsCalls = 0;
    const api = mockApi({
      'GET /wallets': () => {
        walletsCalls += 1;
        return walletsCalls === 1 ? problem(401, 'UNAUTHENTICATED') : ok({ items: [] });
      },
      'POST /auth/refresh': ok({ ...makeAuthSession(), accessToken: 'rotated-token' }),
    });
    const { api: client } = await import('@/lib/api-client');
    await expect(client.request('/wallets')).resolves.toEqual({ items: [] });
    expect(api.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(api.callsTo('GET /wallets')[1]?.headers.get('Authorization')).toBe(
      'Bearer rotated-token',
    );
    expect(JSON.stringify({ ...localStorage, ...sessionStorage }) + document.cookie).not.toContain(
      'rotated-token',
    );
  });
});

describe('sign-out across tabs', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** In-memory BroadcastChannel: delivers to every other open instance with the same name. */
  function stubBroadcastChannel() {
    const open = new Set<FakeChannel>();
    class FakeChannel {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      constructor(readonly name: string) {
        open.add(this);
      }
      postMessage(data: unknown) {
        for (const other of open) {
          if (other !== this && other.name === this.name) {
            other.onmessage?.({ data } as MessageEvent<unknown>);
          }
        }
      }
      close() {
        open.delete(this);
      }
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    return {
      /** Simulates another tab: its own channel posts to the one this tab listens on. */
      fromOtherTab: (data: unknown) => {
        const other = new FakeChannel('midas-session');
        other.postMessage(data);
        other.close();
      },
    };
  }

  it('clears the session and cache and goes to sign-in when another tab signs out', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const channel = stubBroadcastChannel();
    mockApi({});
    const { router, queryClient } = await renderApp('/settings');
    await screen.findByRole('heading', { name: 'Settings' });
    queryClient.setQueryData(['wallets', 'list'], { items: [] });
    act(() => channel.fromOtherTab({ type: 'something-else' }));
    expect(getSessionSnapshot().user).not.toBeNull();
    act(() => channel.fromOtherTab({ type: 'signed-out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSessionSnapshot().user).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('tells the other tabs when this one signs out', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const channel = stubBroadcastChannel();
    mockApi({ 'POST /auth/logout': noContent() });
    const received: unknown[] = [];
    const listener = new BroadcastChannel('midas-session');
    listener.onmessage = (event) => received.push(event.data);
    void channel;
    const user = userEvent.setup();
    const { router } = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: /Account menu for Kim Morgan/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(received).toEqual([{ type: 'signed-out' }]);
    listener.close();
  });

  it('still signs out where BroadcastChannel does not exist', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    vi.stubGlobal('BroadcastChannel', undefined);
    mockApi({ 'POST /auth/logout': noContent() });
    const user = userEvent.setup();
    const { router } = await renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: /Account menu for Kim Morgan/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(getSessionSnapshot().user).toBeNull();
  });
});
