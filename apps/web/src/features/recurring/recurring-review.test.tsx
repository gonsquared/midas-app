import type { RecurringTemplate } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeCategory, makeTemplate, makeWallet, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mock-api';

let templates: RecurringTemplate[];
const wallet = makeWallet({ name: 'Checking' });
const rent = makeCategory({ name: 'Rent', icon: 'house' });

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /recurring-templates': () => ok({ items: templates }),
    'GET /wallets': ok({ items: [wallet] }),
    'GET /categories': ok({ items: [rent] }),
    'POST /recurring-templates/preview': ok({ dates: [] }),
    ...extra,
  });
}

async function openPage() {
  setViewport(VIEWPORT.desktop);
  signedInAs('user');
  const user = userEvent.setup();
  await renderApp('/recurring');
  return { user };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  resetFixtureIds();
  templates = [makeTemplate({ name: 'Rent' })];
});
afterEach(() => vi.useRealTimers());

describe('schedule preview state', () => {
  it('settles on "the schedule has ended" and asks the API once, not on every render', async () => {
    const mocks = api();
    const { user } = await openPage();
    await user.click(await screen.findByRole('button', { name: 'Actions for Rent' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit recurring transaction' });
    expect(
      await within(dialog).findByText(
        'No more dates: the schedule has ended.',
        {},
        { timeout: 4000 },
      ),
    ).toBeVisible();
    expect(within(dialog).queryByText(/Calculating/)).not.toBeInTheDocument();
    // Let any render loop show itself: the request count must stay at one.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(mocks.callsTo('POST /recurring-templates/preview')).toHaveLength(1);
  });
});

describe('row actions', () => {
  it('returns focus to the row Actions button after Edit from the menu is cancelled', async () => {
    api();
    const { user } = await openPage();
    const trigger = await screen.findByRole('button', { name: 'Actions for Rent' });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit recurring transaction' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('sends a single Pause request when the button is clicked twice', async () => {
    const target = templates[0]!;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const path = ('POST /recurring-templates/' + target.id + '/pause') as never;
    const mocks = api({
      [path as string]: async () => {
        await gate;
        return ok({ ...target, status: 'paused' });
      },
    });
    const { user } = await openPage();
    const pause = await screen.findByRole('button', { name: /^Pause/ });
    await user.dblClick(pause);
    release();
    await waitFor(() => expect(mocks.callsTo(path)).toHaveLength(1));
  });
});
