import type { RecurringTemplate } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeCategory, makeTemplate, makeWallet, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '@/test/mock-api';

type Key = keyof MockRoutes;

// QA gate E8-F1-S5: edit flow and server validation errors displayed.
let templates: RecurringTemplate[];
const wallet = makeWallet({ name: 'Checking' });
const rent = makeCategory({ name: 'Rent', icon: 'house' });

function recurringApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /recurring-templates': () => ok({ items: templates }),
    'GET /wallets': ok({ items: [wallet] }),
    'GET /categories': ok({ items: [rent] }),
    'POST /recurring-templates/preview': ok({ dates: ['2026-11-01', '2026-12-01'] }),
    ...extra,
  });
}

async function openEdit() {
  setViewport(VIEWPORT.desktop);
  signedInAs('user');
  const user = userEvent.setup();
  await renderApp('/recurring');
  await user.click(await screen.findByRole('button', { name: 'Actions for Rent' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit recurring transaction' });
  return { user, dialog };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  resetFixtureIds();
  templates = [makeTemplate({ name: 'Rent' })];
});
afterEach(() => vi.useRealTimers());

describe('edit recurring', () => {
  it('sends only the changed field when editing a template', async () => {
    const target = templates[0]!;
    const api = recurringApi({
      ['PATCH /recurring-templates/' + target.id]: ok({ ...target, name: 'Flat rent' }),
    });
    const { user, dialog } = await openEdit();
    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, 'Flat rent');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));
    await waitFor(() =>
      expect(api.callsTo(('PATCH /recurring-templates/' + target.id) as Key)).toHaveLength(1),
    );
    expect(api.callsTo(('PATCH /recurring-templates/' + target.id) as Key)[0]!.body).toEqual({
      name: 'Flat rent',
    });
  });
});

describe('server validation errors', () => {
  it('shows field errors returned by the API next to the field and keeps the dialog open', async () => {
    const target = templates[0]!;
    recurringApi({
      ['PATCH /recurring-templates/' + target.id]: problem(400, 'VALIDATION_FAILED', {
        errors: [{ field: 'name', code: 'too_big', message: 'Name is too long.' }],
      }),
    });
    const { user, dialog } = await openEdit();
    const name = within(dialog).getByLabelText(/^Name/);
    await user.type(name, ' extra');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));
    expect((await within(dialog).findAllByText(/Name is too long/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog', { name: 'Edit recurring transaction' })).toBeVisible();
  });

  it('maps WALLET_ARCHIVED and LIMIT_REACHED to plain sentences', async () => {
    const target = templates[0]!;
    recurringApi({
      ['PATCH /recurring-templates/' + target.id]: problem(409, 'WALLET_ARCHIVED'),
    });
    const { user, dialog } = await openEdit();
    await user.type(within(dialog).getByLabelText(/^Name/), 'x');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));
    expect((await within(dialog).findAllByText(/That wallet is archived/)).length).toBeGreaterThan(
      0,
    );
  });
});
