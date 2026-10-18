import type { AdminUser } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeAdminUser, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok, problem, type MockRequest } from '@/test/mock-api';

const SELF_ID = '3f2b8c1e-9d44-4a55-8f0c-0a1b2c3d4e5f';
let users: AdminUser[];

function detail(user: AdminUser, extra: Record<string, unknown> = {}) {
  return { ...user, suspendedReason: null, activeSessionCount: 2, ...extra };
}

async function openAdmin(path: string, role: 'user' | 'admin' = 'admin') {
  setViewport(VIEWPORT.desktop);
  signedInAs(role);
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

beforeEach(() => {
  resetFixtureIds();
  users = [
    makeAdminUser({ displayName: 'Lee Park', email: 'lee@example.com' }),
    makeAdminUser({
      id: SELF_ID,
      displayName: 'Kim Morgan',
      email: 'kim@example.com',
      role: 'admin',
    }),
  ];
});

describe('admin access', () => {
  it('shows Not found to non-admins without calling the admin API', async () => {
    const api = mockApi({});
    await openAdmin('/admin/users', 'user');
    expect(await screen.findByRole('heading', { name: /not found|page/i })).toBeVisible();
    expect(api.calls.filter((c) => c.path.startsWith('/admin'))).toHaveLength(0);
  });
});

describe('overview', () => {
  it('shows aggregates with the privacy line and proportion bars', async () => {
    mockApi({
      'GET /admin/metrics': ok({
        generatedAt: '2026-10-16T08:00:00.000Z',
        users: { total: 1204, active30d: 812, new30d: 58, suspended: 4, admins: 3 },
        wallets: { total: 3810, active: 3402 },
        transactions: { total: 412330, last30d: 38904 },
        recurringTemplates: { active: 1147 },
      }),
    });
    const { container } = await openAdmin('/admin');
    expect(await screen.findByText('1,204')).toBeVisible();
    expect(screen.getByTestId('admin-privacy')).toHaveTextContent('never show anyone');
    expect(screen.getByRole('img', { name: /67% of accounts were active/ })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('handles errors', async () => {
    mockApi({ 'GET /admin/metrics': problem(500, 'INTERNAL_ERROR') });
    await openAdmin('/admin');
    expect(await screen.findByText(/Couldn't load platform totals/)).toBeVisible();
  });
});

describe('users', () => {
  function usersApi(extra: Parameters<typeof mockApi>[0] = {}) {
    return mockApi({
      'GET /admin/users': () =>
        ok({ items: users, page: 1, pageSize: 25, totalItems: users.length, totalPages: 1 }),
      ...extra,
    });
  }

  it('lists users with a count and passes search to the API', async () => {
    const api = usersApi();
    const { user } = await openAdmin('/admin/users');
    const table = await screen.findByRole('table', { name: 'Users' });
    expect(within(table).getAllByText('Lee Park').length).toBeGreaterThan(0);
    expect(within(table).getByText('You')).toBeVisible();
    expect(screen.getByText('Showing 1-2 of 2')).toBeVisible();
    await user.type(screen.getByLabelText('Search name or email'), 'lee');
    await waitFor(() =>
      expect(api.callsTo('GET /admin/users').some((c) => c.params.get('q') === 'lee')).toBe(true),
    );
  });

  it('suspends a user after confirmation and shows the new status', async () => {
    const target = users[0]!;
    const api = usersApi({
      [`GET /admin/users/${target.id}`]: () => ok(detail(target)),
      [`POST /admin/users/${target.id}/suspend`]: (request: MockRequest) => {
        expect(request.body).toEqual({ reason: 'Abuse' });
        return ok(detail(target, { status: 'suspended', suspendedAt: '2026-10-16T09:00:00.000Z' }));
      },
    });
    const { user } = await openAdmin('/admin/users');
    await user.click(await screen.findByRole('button', { name: /Manage Lee Park/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Lee Park' });
    await user.click(await within(drawer).findByRole('button', { name: 'Suspend' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Suspend Lee Park?' });
    expect(confirm).toHaveTextContent('signed out on every device');
    await user.type(within(confirm).getByLabelText(/Reason/), 'Abuse');
    await user.click(within(confirm).getByRole('button', { name: 'Suspend account' }));
    await waitFor(() =>
      expect(api.callsTo(`POST /admin/users/${target.id}/suspend`)).toHaveLength(1),
    );
    expect((await screen.findAllByText(/Account suspended/)).length).toBeGreaterThan(0);
  });

  it('keeps the dialog open with an inline message on LAST_ADMIN', async () => {
    const target = users[0]!;
    usersApi({
      [`GET /admin/users/${target.id}`]: () => ok(detail(target, { role: 'admin' })),
      [`PATCH /admin/users/${target.id}/role`]: problem(409, 'LAST_ADMIN'),
    });
    const { user } = await openAdmin('/admin/users');
    await user.click(await screen.findByRole('button', { name: /Manage Lee Park/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Lee Park' });
    await user.click(
      await within(drawer).findByRole('button', { name: 'Remove administrator access' }),
    );
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Remove administrator access' }));
    expect(
      await within(confirm).findByText('There must be at least one active administrator.'),
    ).toBeVisible();
  });

  it('disables self-management with visible text', async () => {
    const me = users[1]!;
    usersApi({ [`GET /admin/users/${me.id}`]: () => ok(detail(me)) });
    const { user } = await openAdmin('/admin/users');
    await user.click(await screen.findByRole('button', { name: /Manage Kim Morgan/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Kim Morgan' });
    expect(
      await within(drawer).findByText("You can't change your own role or status."),
    ).toBeVisible();
    expect(within(drawer).queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
  });
});
