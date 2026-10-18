import type { RecurringTemplate } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeCategory, makeTemplate, makeWallet, resetFixtureIds } from '@/test/fixtures';
import { mockApi, noContent, ok, problem } from '@/test/mock-api';

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

async function openRecurring(path = '/recurring') {
  setViewport(VIEWPORT.desktop);
  signedInAs('user');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  resetFixtureIds();
  templates = [
    makeTemplate({ name: 'Rent' }),
    makeTemplate({
      name: 'Gym',
      status: 'paused',
      lastError: 'CATEGORY_RETIRED',
      nextRunOn: null,
      amountMinor: 4000,
    }),
  ];
});
afterEach(() => vi.useRealTimers());

describe('recurring list', () => {
  it('shows schedule, next date, signed amount and status with text', async () => {
    recurringApi();
    await openRecurring();
    const table = await screen.findByRole('table', { name: 'Recurring transactions' });
    const row = within(table).getByRole('row', { name: /Rent/ });
    expect(row).toHaveTextContent('Monthly on the 1st');
    expect(row).toHaveTextContent('Nov 1');
    expect(row).toHaveTextContent('−$1,200.00');
    expect(row).toHaveTextContent('Active');
  });

  it('explains a template paused by the system and how to fix it', async () => {
    recurringApi();
    await openRecurring();
    const attention = await screen.findByRole('region', { name: 'Needs attention (1)' });
    expect(attention).toHaveTextContent('Gym: paused. The category was retired.');
    expect(within(attention).getByRole('button', { name: 'Choose category' })).toBeVisible();
  });

  it('pauses a template and says nothing is backfilled', async () => {
    const target = templates[0]!;
    const api = recurringApi({
      [`POST /recurring-templates/${target.id}/pause`]: () => {
        templates = templates.map((t) => (t.id === target.id ? { ...t, status: 'paused' } : t));
        return ok({ ...target, status: 'paused' });
      },
    });
    const { user } = await openRecurring();
    await user.click(await screen.findByRole('button', { name: /Pause/ }));
    await waitFor(() =>
      expect(api.callsTo(`POST /recurring-templates/${target.id}/pause`)).toHaveLength(1),
    );
    expect((await screen.findAllByText(/missed dates aren't added later/)).length).toBeGreaterThan(
      0,
    );
  });

  it('turns a resume conflict into a fix-it message', async () => {
    const target = templates[1]!;
    recurringApi({
      [`POST /recurring-templates/${target.id}/resume`]: problem(409, 'WALLET_ARCHIVED'),
    });
    const { user } = await openRecurring();
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('Unarchive Checking first')).toBeVisible();
  });

  it('deletes after confirmation and says generated transactions stay', async () => {
    const target = templates[0]!;
    const api = recurringApi({ [`DELETE /recurring-templates/${target.id}`]: noContent() });
    const { user } = await openRecurring();
    await user.click(await screen.findByRole('button', { name: 'Actions for Rent' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Transactions it already added stay in your ledger.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete recurring' }));
    await waitFor(() =>
      expect(api.callsTo(`DELETE /recurring-templates/${target.id}`)).toHaveLength(1),
    );
  });

  it('has no axe violations', async () => {
    recurringApi();
    const { container } = await openRecurring();
    await screen.findByRole('table', { name: 'Recurring transactions' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('create form', () => {
  it('shows validation errors, then previews next dates and creates', async () => {
    const created = makeTemplate({ name: 'Phone' });
    const api = recurringApi({ 'POST /recurring-templates': ok(created, 201) });
    const { user } = await openRecurring();
    await user.click((await screen.findAllByRole('button', { name: 'Create recurring' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Create recurring transaction' });
    await user.click(within(dialog).getByRole('button', { name: 'Create recurring' }));
    expect((await within(dialog).findAllByText('Enter a name.')).length).toBeGreaterThan(0);
    expect(api.callsTo('POST /recurring-templates')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Name/), 'Phone');
    await user.type(within(dialog).getByLabelText(/^Amount/), '40');
    await user.selectOptions(within(dialog).getByLabelText(/^Wallet/), wallet.id);
    await user.selectOptions(within(dialog).getByLabelText(/^Category/), rent.id);
    expect(
      await within(dialog).findByText(/Sun, Nov 1, 2026|Sun, Nov 1/, {}, { timeout: 4000 }),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Create recurring' }));
    await waitFor(() => expect(api.callsTo('POST /recurring-templates')).toHaveLength(1));
    expect(api.callsTo('POST /recurring-templates')[0]!.body).toMatchObject({
      name: 'Phone',
      type: 'expense',
      amountMinor: 4000,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-10-16',
    });
  });

  it('opens without injecting style elements', async () => {
    recurringApi();
    const before = document.head.querySelectorAll('style').length;
    const { user } = await openRecurring();
    await user.click((await screen.findAllByRole('button', { name: 'Create recurring' }))[0]!);
    await screen.findByRole('dialog', { name: 'Create recurring transaction' });
    expect(document.head.querySelectorAll('style')).toHaveLength(before);
  });
});
