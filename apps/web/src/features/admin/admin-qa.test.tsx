import type { AdminUser } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeAdminUser, makeAuditEntry, makeCategory, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '@/test/mock-api';

type Key = keyof MockRoutes;

// QA gate for E9-F2-S3 (pagination, role change), E9-F3-S3 (category errors) and E9-F3-S4 (filters, paging).
async function openAdmin(path: string) {
  setViewport(VIEWPORT.desktop);
  signedInAs('admin');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

let users: AdminUser[];
beforeEach(() => {
  resetFixtureIds();
  users = [makeAdminUser({ displayName: 'Lee Park', email: 'lee@example.com' })];
});

describe('users table', () => {
  it('pages through the API with the page number and keeps it in the URL', async () => {
    const api = mockApi({
      'GET /admin/users': (request) => {
        const page = Number(request.params.get('page') ?? '1');
        return ok({ items: users, page, pageSize: 25, totalItems: 40, totalPages: 2 });
      },
    });
    const { user, router } = await openAdmin('/admin/users');
    await screen.findByRole('table', { name: 'Users' });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.callsTo('GET /admin/users').some((c) => c.params.get('page') === '2')).toBe(true),
    );
    expect(await screen.findByText('Page 2 of 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(JSON.stringify(router.state.location.search)).toContain('2');
  });

  it('makes a user an administrator only after confirmation', async () => {
    const target = users[0]!;
    const rolePath = ('PATCH /admin/users/' + target.id + '/role') as Key;
    const api = mockApi({
      'GET /admin/users': ok({ items: users, page: 1, pageSize: 25, totalItems: 1, totalPages: 1 }),
      ['GET /admin/users/' + target.id]: ok({
        ...target,
        suspendedReason: null,
        activeSessionCount: 1,
      }),
      [rolePath]: ok({ ...target, role: 'admin', suspendedReason: null, activeSessionCount: 1 }),
    });
    const { user } = await openAdmin('/admin/users');
    await user.click(await screen.findByRole('button', { name: /Manage Lee Park/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Lee Park' });
    await user.click(await within(drawer).findByRole('button', { name: 'Make administrator' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('still cannot see anyone');
    expect(api.callsTo(rolePath)).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Make administrator' }));
    await waitFor(() => expect(api.callsTo(rolePath)).toHaveLength(1));
    expect(api.callsTo(rolePath)[0]!.body).toEqual({ role: 'admin' });
  });

  it('reactivates a suspended user after confirmation', async () => {
    const target = makeAdminUser({ displayName: 'Sam Roe', status: 'suspended' });
    users = [target];
    const path = ('POST /admin/users/' + target.id + '/reactivate') as Key;
    const api = mockApi({
      'GET /admin/users': ok({ items: users, page: 1, pageSize: 25, totalItems: 1, totalPages: 1 }),
      ['GET /admin/users/' + target.id]: ok({
        ...target,
        suspendedReason: 'Abuse',
        activeSessionCount: 0,
      }),
      [path]: ok({ ...target, status: 'active', suspendedReason: null, activeSessionCount: 0 }),
    });
    const { user } = await openAdmin('/admin/users');
    await user.click(await screen.findByRole('button', { name: /Manage Sam Roe/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Sam Roe' });
    await user.click(await within(drawer).findByRole('button', { name: 'Reactivate' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Reactivate Sam Roe?' });
    expect(api.callsTo(path)).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Reactivate account' }));
    await waitFor(() => expect(api.callsTo(path)).toHaveLength(1));
  });
});

describe('admin navigation', () => {
  it('does not offer admin links to regular users', async () => {
    setViewport(VIEWPORT.desktop);
    signedInAs('user');
    mockApi({});
    await renderApp('/dashboard');
    await screen.findByRole('main');
    expect(screen.queryByRole('link', { name: /Administration|Admin|Users|Audit/ })).toBeNull();
  });
});

describe('default categories errors', () => {
  it('shows a name clash on the name field when renaming a default category', async () => {
    const groceries = makeCategory({ name: 'Groceries' });
    const dining = makeCategory({ name: 'Dining' });
    const path = ('PATCH /admin/categories/' + groceries.id) as Key;
    const api = mockApi({
      'GET /admin/categories': ok({ items: [groceries, dining] }),
      [path]: problem(409, 'CATEGORY_NAME_TAKEN'),
    });
    const { user } = await openAdmin('/admin/categories');
    await user.click(await screen.findByRole('button', { name: /^Edit\s*Groceries/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit default category' });
    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, 'Dining');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.callsTo(path)).toHaveLength(1));
    expect(api.callsTo(path)[0]!.body).toEqual({ name: 'Dining' });
    expect((await within(dialog).findAllByText(/already has this name/)).length).toBeGreaterThan(0);
  });

  it('does not call the API when creating without a name', async () => {
    const api = mockApi({ 'GET /admin/categories': ok({ items: [] }) });
    const { user } = await openAdmin('/admin/categories');
    await user.click(await screen.findByRole('button', { name: 'Create category' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create default category' });
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }));
    expect(api.callsTo('POST /admin/categories')).toHaveLength(0);
  });
});

describe('audit log filters and paging', () => {
  it('sends the actor, action and UTC date filters and keeps them in the URL', async () => {
    const api = mockApi({
      'GET /admin/audit-logs': ok({ items: [makeAuditEntry()], nextCursor: null }),
    });
    const { user, router } = await openAdmin('/admin/audit');
    await screen.findByRole('table', { name: /Audit log/ });
    await user.type(screen.getByLabelText('Actor email'), 'kim@example.com');
    await user.selectOptions(screen.getByLabelText('Action'), 'admin.user_suspended');
    await user.type(screen.getByLabelText('From (UTC day)'), '2026-10-01');
    await user.type(screen.getByLabelText('To (UTC day)'), '2026-10-16');
    await waitFor(() => {
      const last = api.callsTo('GET /admin/audit-logs').at(-1)!;
      expect(last.params.get('actorEmail')).toBe('kim@example.com');
      expect(last.params.getAll('action')).toEqual(['admin.user_suspended']);
      expect(last.params.get('from')).toBe('2026-10-01');
      expect(last.params.get('to')).toBe('2026-10-16');
    });
    expect(JSON.stringify(router.state.location.search)).toContain('kim@example.com');
  });

  it('loads the next page with the cursor and appends rows', async () => {
    const first = makeAuditEntry({ action: 'admin.user_suspended' });
    const second = makeAuditEntry({ action: 'admin.user_reactivated' });
    const api = mockApi({
      'GET /admin/audit-logs': (request) =>
        request.params.get('cursor') === 'c1'
          ? ok({ items: [second], nextCursor: null })
          : ok({ items: [first], nextCursor: 'c1' }),
    });
    const { user } = await openAdmin('/admin/audit');
    const table = await screen.findByRole('table', { name: /Audit log/ });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    expect(api.callsTo('GET /admin/audit-logs').at(-1)!.params.get('cursor')).toBe('c1');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
