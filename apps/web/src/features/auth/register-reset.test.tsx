import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { mockApi, noContent, ok, problem } from '@/test/mock-api';
import { makeAuthSession, renderApp, setViewport, VIEWPORT } from '@/test/helpers';

const GOOD_PASSWORD = 'correct horse battery staple';
const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234';

describe('register page', () => {
  it('lists every invalid field in an alert summary and focuses the first', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({});
    const user = userEvent.setup();
    await renderApp('/register');
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('3 things need fixing');
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(api.callsTo('POST /auth/register')).toHaveLength(0);
  });

  it('creates the account with regional defaults and lands on the dashboard', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({ 'POST /auth/register': ok(makeAuthSession(), 201) });
    const user = userEvent.setup();
    const { router } = await renderApp('/register');
    await user.type(await screen.findByLabelText('Name'), '  Kim Morgan ');
    await user.type(screen.getByLabelText('Email'), 'Kim@Example.com');
    await user.type(screen.getByLabelText('Password'), GOOD_PASSWORD);
    expect(await screen.findByText(/Strength:/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    const body = api.callsTo('POST /auth/register')[0]?.body as Record<string, string>;
    expect(body).toMatchObject({
      displayName: 'Kim Morgan',
      email: 'kim@example.com',
      password: GOOD_PASSWORD,
    });
    expect(body['currency']).toMatch(/^[A-Z]{3}$/);
    expect(body['locale']).toBeTruthy();
    expect(body['timezone']).toBeTruthy();
  });

  it('shows neutral wording with next steps when the email is taken', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({
      'POST /auth/register': problem(409, 'EMAIL_TAKEN', {
        errors: [{ field: 'email', code: 'EMAIL_TAKEN', message: 'Email is taken' }],
      }),
    });
    const user = userEvent.setup();
    await renderApp('/register');
    await user.type(await screen.findByLabelText('Name'), 'Kim');
    await user.type(screen.getByLabelText('Email'), 'kim@example.com');
    await user.type(screen.getByLabelText('Password'), GOOD_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('That email cannot be used. Sign in or reset your password.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'reset your password' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getAllByRole('link', { name: 'Sign in' })).toHaveLength(2);
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue('kim@example.com');
  });

  it('maps a weak password from the server to the password field', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({
      'POST /auth/register': problem(400, 'VALIDATION_FAILED', {
        errors: [
          { field: 'password', code: 'WEAK_PASSWORD', message: 'Password is too easy to guess.' },
        ],
      }),
    });
    const user = userEvent.setup();
    await renderApp('/register');
    await user.type(await screen.findByLabelText('Name'), 'Kim');
    await user.type(screen.getByLabelText('Email'), 'kim@example.com');
    await user.type(screen.getByLabelText('Password'), 'passwordpassword');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Password is too easy to guess.')).toBeVisible();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('reveals the password only on request and offers regional changes', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({});
    const user = userEvent.setup();
    const { container } = await renderApp('/register');
    await user.type(await screen.findByLabelText('Password'), GOOD_PASSWORD);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Currency')).toBeVisible();
    expect(screen.getByLabelText('Time zone')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('forgot password page', () => {
  it('confirms without revealing whether the account exists, then enforces a cooldown', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({ 'POST /auth/password/forgot': ok({ status: 'accepted' }, 202) });
    const user = userEvent.setup();
    await renderApp('/forgot-password');
    await user.type(await screen.findByLabelText('Email'), 'Kim@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(
      await screen.findByText(
        'If an account exists for Kim@Example.com, we have sent a link. It expires in 30 minutes.',
      ),
    ).toBeVisible();
    expect(api.callsTo('POST /auth/password/forgot')[0]?.body).toEqual({
      email: 'kim@example.com',
    });
    const resend = screen.getByRole('button', { name: /Send again in 1:00/ });
    expect(resend).toHaveAttribute('aria-disabled', 'true');
    await user.click(resend);
    expect(api.callsTo('POST /auth/password/forgot')).toHaveLength(1);
  });

  it('validates the email before sending', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({});
    const user = userEvent.setup();
    await renderApp('/forgot-password');
    await user.type(await screen.findByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/name@example.com/)).toBeVisible();
    expect(api.fetchMock).not.toHaveBeenCalled();
  });
});

describe('reset password page', () => {
  it('verifies the token, removes it from the address bar, and updates the password', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({
      'POST /auth/password/reset/verify': noContent(),
      'POST /auth/password/reset': noContent(),
    });
    const user = userEvent.setup();
    const { router } = await renderApp(`/reset-password#token=${TOKEN}`);
    const field = await screen.findByLabelText('New password');
    expect(router.state.location.hash).toBe('');
    expect(api.callsTo('POST /auth/password/reset/verify')[0]?.body).toEqual({ token: TOKEN });
    await user.type(field, GOOD_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(api.callsTo('POST /auth/password/reset')[0]?.body).toEqual({
      token: TOKEN,
      newPassword: GOOD_PASSWORD,
    });
    expect(
      await screen.findByText('Password updated. Sign in with your new password.'),
    ).toBeVisible();
  });

  it('handles an expired or used link with a way forward', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({ 'POST /auth/password/reset/verify': problem(400, 'RESET_TOKEN_INVALID') });
    await renderApp(`/reset-password#token=${TOKEN}`);
    expect(await screen.findByText('This link has expired or was already used.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('treats a missing token as an invalid link without calling the API', async () => {
    setViewport(VIEWPORT.desktop);
    const api = mockApi({});
    await renderApp('/reset-password');
    expect(await screen.findByText('This link has expired or was already used.')).toBeVisible();
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the invalid state when the token expires while typing', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({
      'POST /auth/password/reset/verify': noContent(),
      'POST /auth/password/reset': problem(400, 'RESET_TOKEN_INVALID'),
    });
    const user = userEvent.setup();
    await renderApp(`/reset-password#token=${TOKEN}`);
    await user.type(await screen.findByLabelText('New password'), GOOD_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('This link has expired or was already used.')).toBeVisible();
  });

  it('shows a weak password error on the field and keeps the input', async () => {
    setViewport(VIEWPORT.desktop);
    mockApi({
      'POST /auth/password/reset/verify': noContent(),
      'POST /auth/password/reset': problem(400, 'VALIDATION_FAILED', {
        errors: [
          {
            field: 'newPassword',
            code: 'WEAK_PASSWORD',
            message: 'Password is too easy to guess.',
          },
        ],
      }),
    });
    const user = userEvent.setup();
    await renderApp(`/reset-password#token=${TOKEN}`);
    await user.type(await screen.findByLabelText('New password'), 'passwordpassword');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Password is too easy to guess.')).toBeVisible();
    expect(screen.getByLabelText('New password')).toHaveValue('passwordpassword');
    expect(screen.getByLabelText('New password')).toHaveFocus();
  });
});
