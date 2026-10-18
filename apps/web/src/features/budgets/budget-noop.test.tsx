import type { Budget } from '@midas/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeBudget, makeCategory, makeWallet, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mock-api';

let budgets: Budget[];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  resetFixtureIds();
  budgets = [makeBudget({ name: 'Groceries', amountMinor: 40000 })];
});
afterEach(() => vi.useRealTimers());

describe('budget edit without a real change', () => {
  it('sends no PATCH when the limit is retyped in another format, and just closes', async () => {
    const target = budgets[0]!;
    const mocks = mockApi({
      'GET /budgets': () => ok({ date: '2026-10-16', items: budgets }),
      'GET /categories': ok({ items: [makeCategory({ name: 'Groceries' })] }),
      'GET /wallets': ok({ items: [makeWallet()] }),
    });
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    const user = userEvent.setup();
    await renderApp('/budgets');
    await user.click(await screen.findByRole('button', { name: 'Actions for Groceries budget' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit budget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit budget' });
    const limit = within(dialog).getByLabelText(/^Limit/);
    await user.clear(limit);
    await user.type(limit, '400');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));
    expect(screen.queryByRole('dialog', { name: 'Edit budget' })).not.toBeInTheDocument();
    expect(mocks.callsTo(('PATCH /budgets/' + target.id) as never)).toHaveLength(0);
  });
});
