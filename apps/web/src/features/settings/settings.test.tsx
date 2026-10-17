import { axe } from 'vitest-axe';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Amount } from '@/components/domain/amount';
import { getSessionSnapshot, updateSessionUser } from '@/lib/session';
import { mockApi, noContent, ok, problem, type MockRequest } from '@/test/mock-api';
import { makeAuthSession, renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';

function patchMe(request: MockRequest) {
  const base = makeAuthSession().user;
  const body = request.body as {
    displayName?: string;
    preferences?: Partial<typeof base.preferences>;
  };
  return ok({
    ...base,
    displayName: body.displayName ?? base.displayName,
    preferences: { ...base.preferences, ...body.preferences },
  });
}

async function openSettings(tab?: string, viewport: number = VIEWPORT.desktop) {
  setViewport(viewport);
  signedInAs('user');
  const user = userEvent.setup();
  const utils = await renderApp('/settings');
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
  if (tab) await user.click(await screen.findByRole('tab', { name: tab }));
  return { user, ...utils };
}

describe('accessibility at mobile width', () => {
  it.each([undefined, 'Preferences', 'Security'])(
    'settings tab %s has no violations',
    async (tab) => {
      mockApi({});
      const { container } = await openSettings(tab, VIEWPORT.mobile);
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});

describe('profile', () => {
  it('saves the display name and shows the saved status', async () => {
    const api = mockApi({ 'PATCH /me': patchMe });
    const { user } = await openSettings();
    const save = await screen.findByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('No changes to save.')).toBeVisible();
    const name = screen.getByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Kimberly Morgan');
    await user.click(save);
    expect(await screen.findByText('Saved')).toBeVisible();
    expect(api.callsTo('PATCH /me')[0]?.body).toEqual({ displayName: 'Kimberly Morgan' });
    expect(getSessionSnapshot().user?.displayName).toBe('Kimberly Morgan');
    expect(screen.getByText('Email changes are not supported yet.')).toBeVisible();
  });

  it('validates the name and shows server errors on the field', async () => {
    const api = mockApi({
      'PATCH /me': problem(400, 'VALIDATION_FAILED', {
        errors: [{ field: 'displayName', code: 'INVALID', message: 'Not allowed.' }],
      }),
    });
    const { user } = await openSettings();
    const name = await screen.findByLabelText('Display name');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter your name.')).toBeVisible();
    expect(api.callsTo('PATCH /me')).toHaveLength(0);
    await user.type(name, 'Kim');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Not allowed.')).toBeVisible();
  });
});

describe('preferences', () => {
  it('applies the theme immediately, persists it locally and saves it to the account', async () => {
    const api = mockApi({ 'PATCH /me': patchMe });
    const { user } = await openSettings('Preferences');
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('midas.theme')).toBe('dark');
    await waitFor(() =>
      expect(api.callsTo('PATCH /me')[0]?.body).toEqual({ preferences: { theme: 'dark' } }),
    );
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('keeps the theme on this device and says so when saving to the account fails', async () => {
    mockApi({ 'PATCH /me': problem(500, 'INTERNAL_ERROR') });
    const { user } = await openSettings('Preferences');
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(await screen.findByText('Theme not saved to your account')).toBeVisible();
  });

  it('previews formatting live and applies currency and locale after saving', async () => {
    const api = mockApi({ 'PATCH /me': patchMe });
    const { user } = await openSettings('Preferences');
    const sample = await screen.findByTestId('format-sample');
    expect(sample).toHaveTextContent('$1,234.56');
    await user.selectOptions(screen.getByLabelText('Currency'), 'EUR');
    await user.selectOptions(screen.getByLabelText('Language and number format'), 'de-DE');
    expect(sample).toHaveTextContent('1.234,56');
    expect(sample).toHaveTextContent('€');
    // Nothing is applied until saved.
    expect(getSessionSnapshot().user?.preferences.currency).toBe('USD');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved')).toBeVisible();
    expect(api.callsTo('PATCH /me')[0]?.body).toEqual({
      preferences: { currency: 'EUR', locale: 'de-DE', timezone: 'UTC' },
    });
    expect(getSessionSnapshot().user?.preferences).toMatchObject({
      currency: 'EUR',
      locale: 'de-DE',
    });
  });

  it('formats every Amount with the saved preferences', () => {
    signedInAs('user');
    render(<Amount minor={123456} currency="USD" />);
    expect(screen.getByText('$1,234.56')).toBeVisible();
    act(() => {
      updateSessionUser({
        ...makeAuthSession().user,
        preferences: { currency: 'USD', locale: 'de-DE', timezone: 'UTC', theme: 'system' },
      });
    });
    expect(screen.getByText(/1\.234,56/)).toBeVisible();
  });
});

describe('security', () => {
  it('changes the password, clears the fields and confirms', async () => {
    const api = mockApi({ 'POST /me/password': noContent() });
    const { user } = await openSettings('Security');
    await user.type(await screen.findByLabelText('Current password'), 'old-password-123');
    await user.type(screen.getByLabelText('New password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(
      await screen.findByText('Password updated. Other devices were signed out.'),
    ).toBeVisible();
    expect(api.callsTo('POST /me/password')[0]?.body).toEqual({
      currentPassword: 'old-password-123',
      newPassword: 'correct horse battery staple',
    });
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('shows a wrong current password on its field, weak or same passwords on the new one', async () => {
    const api = mockApi({ 'POST /me/password': problem(400, 'INVALID_CURRENT_PASSWORD') });
    const { user } = await openSettings('Security');
    await user.type(await screen.findByLabelText('Current password'), 'wrong-password-1');
    await user.type(screen.getByLabelText('New password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('That is not your current password.')).toBeVisible();
    expect(screen.getByLabelText('Current password')).toHaveFocus();

    api.set(
      'POST /me/password',
      problem(400, 'VALIDATION_FAILED', {
        errors: [
          { field: 'newPassword', code: 'SAME_AS_CURRENT', message: 'Choose a new password.' },
        ],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Choose a new password.')).toBeVisible();
    expect(screen.getByLabelText('New password')).toHaveFocus();
  });
});
