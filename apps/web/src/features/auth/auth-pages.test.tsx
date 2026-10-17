import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { getSessionSnapshot } from '@/lib/session';
import { mockApi, ok, problem } from '@/test/mock-api';
import { makeAuthSession, renderApp, setViewport, VIEWPORT } from '@/test/helpers';

async function fillLogin(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
}

describe('login page', () => {
  it('has labelled inputs reachable by keyboard, in order', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({});
    const user = userEvent.setup();
    await renderApp('/login');
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    await user.tab();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();
  });

  it('validates on submit, focuses the first invalid field and sends nothing', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({});
    const user = userEvent.setup();
    await renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeVisible();
    expect(screen.getByText('Enter your password.')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(api.callsTo('POST /auth/login')).toHaveLength(0);
  });

  it('signs in and routes to the dashboard, keeping the token out of web storage', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({ 'POST /auth/login': ok(makeAuthSession()) });
    const user = userEvent.setup();
    const { router } = await renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await fillLogin(user, ' Kim@Example.com ', 'hunter2-hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(api.callsTo('POST /auth/login')[0]?.body).toEqual({
      email: 'kim@example.com',
      password: 'hunter2-hunter2',
    });
    expect(getSessionSnapshot().user?.email).toBe('kim@example.com');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('test-access');
  });

  it('shows one generic message for bad credentials, keeps input and focuses the password', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({ 'POST /auth/login': problem(401, 'INVALID_CREDENTIALS') });
    const user = userEvent.setup();
    await renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await fillLogin(user, 'kim@example.com', 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText('Email')).toHaveValue('kim@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('wrong-password');
    expect(screen.getByLabelText('Password')).toHaveFocus();
  });

  it('shows the suspended state without a retry loop', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({ 'POST /auth/login': problem(403, 'ACCOUNT_SUSPENDED') });
    const user = userEvent.setup();
    await renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await fillLogin(user, 'kim@example.com', 'hunter2-hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'This account is suspended' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('counts down after a rate limit and blocks repeat submits', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({
      'POST /auth/login': problem(429, 'RATE_LIMITED', { headers: { 'Retry-After': '42' } }),
    });
    const user = userEvent.setup();
    await renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await fillLogin(user, 'kim@example.com', 'hunter2-hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const button = await screen.findByRole('button', { name: 'Try again in 0:42' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(api.callsTo('POST /auth/login')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in 0:4');
  });

  it('never shows server internals for a 5xx', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({ 'POST /auth/login': problem(500, 'INTERNAL_ERROR', { detail: 'stack at db.ts:9' }) });
    const user = userEvent.setup();
    await renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    await fillLogin(user, 'kim@example.com', 'hunter2-hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side');
    expect(screen.queryByText(/stack at/)).not.toBeInTheDocument();
    expect(screen.getByText(/Reference: req-test-0001/)).toBeVisible();
  });

  it('explains why the visitor is here', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({});
    await renderApp('/login?reason=expired');
    expect(await screen.findByText('You were signed out. Sign in to continue.')).toBeVisible();
  });

  it.each(['/login', '/register', '/forgot-password'])(
    '%s has no accessibility violations at mobile width',
    async (path) => {
      setViewport(VIEWPORT.mobile);
      mockApi({});
      const { container } = await renderApp(path);
      await screen.findByRole('heading', { level: 1 });
      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it('has no detectable accessibility violations', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({});
    const { container } = await renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
