import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeAuditEntry, makeCategory, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok, problem } from '@/test/mock-api';

async function openAdmin(path: string) {
  setViewport(VIEWPORT.desktop);
  signedInAs('admin');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

beforeEach(() => resetFixtureIds());

describe('default categories', () => {
  it('lists, retires with an explanation, and reports a restore name clash', async () => {
    const groceries = makeCategory({ name: 'Groceries' });
    const gifts = makeCategory({ name: 'Gifts', retired: true });
    const api = mockApi({
      'GET /admin/categories': ok({ items: [groceries, gifts] }),
      [`POST /admin/categories/${groceries.id}/retire`]: ok({ ...groceries, retired: true }),
      [`POST /admin/categories/${gifts.id}/restore`]: problem(409, 'CATEGORY_NAME_TAKEN'),
    });
    const { user, container } = await openAdmin('/admin/categories');
    const table = await screen.findByRole('table', { name: 'Default expense categories' });
    expect(within(table).queryByText('Gifts')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('switch', { name: 'Show retired' }));
    await user.click(await screen.findByRole('button', { name: 'Restore Gifts' }));
    expect(
      await screen.findByText(/An active default category already has this name/),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Retire Groceries' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Retire Groceries?' });
    expect(confirm).toHaveTextContent(
      'Existing transactions, budgets and recurring items keep it.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Retire category' }));
    await waitFor(() =>
      expect(api.callsTo(`POST /admin/categories/${groceries.id}/retire`)).toHaveLength(1),
    );
  });

  it('shows an error state', async () => {
    mockApi({ 'GET /admin/categories': problem(500, 'INTERNAL_ERROR') });
    await openAdmin('/admin/categories');
    expect(await screen.findByText(/Couldn't load default categories/)).toBeVisible();
  });
});

describe('audit log', () => {
  it('shows UTC times, human action labels, expandable details and no edit controls', async () => {
    const api = mockApi({
      'GET /admin/audit-logs': ok({ items: [makeAuditEntry()], nextCursor: 'c1' }),
    });
    const { user, container } = await openAdmin('/admin/audit?action=admin.user_suspended');
    const table = await screen.findByRole('table', {
      name: /Audit log, newest first, times in UTC/,
    });
    expect(table).toHaveTextContent('2026-10-16 08:30:12');
    expect(table).toHaveTextContent('User suspended');
    expect(table).toHaveTextContent('admin.user_suspended');
    expect(api.callsTo('GET /admin/audit-logs')[0]!.params.getAll('action')).toEqual([
      'admin.user_suspended',
    ]);
    const toggle = within(table).getByRole('button', { name: /Details/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(table).toHaveTextContent('Sessions revoked2');
    expect(screen.queryByRole('button', { name: /delete|edit/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeVisible();
  });

  it('has an empty and an error state', async () => {
    mockApi({ 'GET /admin/audit-logs': ok({ items: [], nextCursor: null }) });
    await openAdmin('/admin/audit');
    expect(await screen.findByText('No audit entries match these filters.')).toBeVisible();
  });

  it('shows an error with retry', async () => {
    mockApi({ 'GET /admin/audit-logs': problem(500, 'INTERNAL_ERROR') });
    await openAdmin('/admin/audit');
    expect(await screen.findByText(/Couldn't load the audit log/)).toBeVisible();
  });
});
