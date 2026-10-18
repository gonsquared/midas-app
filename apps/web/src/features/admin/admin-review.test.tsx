import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeAuditEntry, makeCategory, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok } from '@/test/mock-api';

beforeEach(() => resetFixtureIds());

async function openAdmin(path: string) {
  setViewport(VIEWPORT.desktop);
  signedInAs('admin');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

describe('default category edit without changes', () => {
  it('sends no PATCH and closes the dialog', async () => {
    const category = makeCategory({ name: 'Groceries', system: true });
    const mocks = mockApi({ 'GET /admin/categories': ok({ items: [category] }) });
    const { user } = await openAdmin('/admin/categories');
    await user.click(await screen.findByRole('button', { name: /^Edit Groceries/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit default category' });
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(screen.queryByRole('dialog', { name: 'Edit default category' })).not.toBeInTheDocument();
    expect(mocks.callsTo(('PATCH /admin/categories/' + category.id) as never)).toHaveLength(0);
  });
});

describe('audit log', () => {
  it('shows only allowlisted metadata and hides everything else', async () => {
    const entry = makeAuditEntry({
      action: 'admin.user_role_changed',
      metadata: { from: 'user', to: 'admin', emailHmac: 'secret-pseudonym', extra: '<b>x</b>' },
    });
    mockApi({ 'GET /admin/audit-logs': ok({ items: [entry], nextCursor: null }) });
    const { user } = await openAdmin('/admin/audit');
    await user.click(await screen.findByRole('button', { name: /Details/ }));
    expect(screen.getByText('admin')).toBeVisible();
    expect(screen.queryByText('secret-pseudonym')).not.toBeInTheDocument();
    expect(screen.queryByText(/<b>x<\/b>/)).not.toBeInTheDocument();
    expect(screen.getByText('Other fields')).toBeVisible();
  });

  it('explains a reversed date range instead of dropping it, and does not query', async () => {
    const mocks = mockApi({ 'GET /admin/audit-logs': ok({ items: [], nextCursor: null }) });
    await openAdmin('/admin/audit?from=2026-10-16&to=2026-10-01');
    expect(await screen.findByText(/end date must be on or after the start date/i)).toBeVisible();
    expect(screen.getByLabelText(/^From/)).toHaveValue('2026-10-16');
    expect(screen.getByLabelText(/^To/)).toHaveValue('2026-10-01');
    expect(mocks.callsTo('GET /admin/audit-logs')).toHaveLength(0);
  });
});
