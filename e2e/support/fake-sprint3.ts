import type { Page, Route } from '@playwright/test';
import { CATEGORIES, type FakeApi } from './fake-api';

/** Sprint 3 additions to the in-memory API: budgets, reports, recurring, admin, export. */
const STAMP = '2026-10-01T00:00:00.000Z';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TODAY = new Date().toISOString().slice(0, 10);

type Json = Record<string, unknown>;

export interface Sprint3State {
  role: 'user' | 'admin';
  budgets: Json[];
  templates: Json[];
  users: Json[];
  exportRequests: string[];
  suspendedIds: string[];
}

const json = (status: number, body: unknown) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});
const problem = (status: number, code: string) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({
    type: 'about:blank',
    title: code,
    status,
    detail: code,
    instance: '/api/v1',
    code,
    requestId: 'req-e2e-0002',
  }),
});

const ref = (c: (typeof CATEGORIES)[number]) => ({
  id: c.id,
  name: c.name,
  type: c.type,
  icon: c.icon,
  color: c.color,
  system: true,
  retired: false,
});

/** A monthly budget for the month containing today, with the status computed from `spent`. */
export function makeBudget(
  n: number,
  categoryIndex: number | null,
  limit: number,
  spent: number,
): Json {
  const start = `${TODAY.slice(0, 8)}01`;
  const end = new Date(Date.UTC(Number(TODAY.slice(0, 4)), Number(TODAY.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  const state = spent >= limit ? 'exceeded' : spent * 100 >= limit * 80 ? 'warning' : 'ok';
  const category = categoryIndex === null ? null : CATEGORIES[categoryIndex];
  return {
    id: uuid(n),
    scope: category ? 'category' : 'overall',
    category: category ? ref(category) : null,
    period: 'monthly',
    amountMinor: limit,
    currency: 'USD',
    warningThresholdPct: 80,
    startDate: start,
    status: {
      periodStart: start,
      periodEnd: end,
      spentMinor: spent,
      remainingMinor: limit - spent,
      percentUsed: Math.round((spent / limit) * 1000) / 10,
      state,
    },
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

export function makeTemplate(n: number, name: string, status = 'active'): Json {
  return {
    id: uuid(n),
    name,
    type: 'expense',
    wallet: { id: uuid(10), name: 'Checking', currency: 'USD', archived: false },
    category: ref(CATEGORIES[0]!),
    amountMinor: 120000,
    currency: 'USD',
    note: null,
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-01',
    endDate: null,
    nextRunOn: `${TODAY.slice(0, 8)}28`,
    status,
    lastRunAt: null,
    lastError: null,
    consecutiveFailures: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

export function makeAdminUser(n: number, name: string, role = 'user'): Json {
  return {
    id: uuid(n),
    email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
    displayName: name,
    role,
    status: 'active',
    createdAt: STAMP,
    lastLoginAt: STAMP,
    suspendedAt: null,
  };
}

const adminSession = () => ({
  accessToken: 'e2e-admin-token',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: uuid(1),
    email: 'kim@example.com',
    displayName: 'Kim Morgan',
    role: 'admin',
    status: 'active',
    preferences: { currency: 'USD', locale: 'en-US', timezone: 'UTC', theme: 'light' },
    createdAt: STAMP,
    updatedAt: STAMP,
  },
});

export function newSprint3State(initial: Partial<Sprint3State> = {}): Sprint3State {
  return {
    role: 'user',
    budgets: [],
    templates: [],
    users: [],
    exportRequests: [],
    suspendedIds: [],
    ...initial,
  };
}

function summary(api: FakeApi, state: Sprint3State) {
  const income = 420000;
  const expense = state.budgets.length > 0 ? 310040 : 0;
  return {
    from: `${TODAY.slice(0, 8)}01`,
    to: TODAY,
    wallets: api.wallets,
    totalsByCurrency: [
      {
        currency: 'USD',
        balanceMinor: api.wallets.reduce((sum, w) => sum + w.balanceMinor, 0),
        incomeMinor: income,
        expenseMinor: expense,
        netMinor: income - expense,
      },
    ],
    recentTransactions: api.transactions.slice(0, 10),
    budgets: state.budgets,
  };
}

async function handleBudgets(
  route: Route,
  path: string,
  method: string,
  api: FakeApi,
  state: Sprint3State,
) {
  void api;
  const request = route.request();
  if (method === 'GET' && path === '/budgets') {
    return route.fulfill(json(200, { date: TODAY, items: state.budgets }));
  }
  if (method === 'POST' && path === '/budgets') {
    const body = request.postDataJSON() as Json;
    const index = CATEGORIES.findIndex((c) => c.id === body['categoryId']);
    const exists = state.budgets.some(
      (b) => (b['category'] as { id?: string } | null)?.id === body['categoryId'],
    );
    if (exists) return route.fulfill(problem(409, 'BUDGET_EXISTS'));
    const budget = makeBudget(
      900 + state.budgets.length,
      index >= 0 ? index : null,
      Number(body['amountMinor']),
      0,
    );
    state.budgets.push(budget);
    return route.fulfill(json(201, budget));
  }
  const one = /^\/budgets\/([^/]+)$/.exec(path);
  if (method === 'DELETE' && one) {
    state.budgets = state.budgets.filter((b) => b['id'] !== one[1]);
    return route.fulfill({ status: 204 });
  }
  return route.fallback();
}

async function handleRecurring(route: Route, path: string, method: string, state: Sprint3State) {
  const request = route.request();
  if (method === 'GET' && path === '/recurring-templates') {
    return route.fulfill(json(200, { items: state.templates }));
  }
  if (method === 'POST' && path === '/recurring-templates/preview') {
    const base = `${TODAY.slice(0, 8)}28`;
    return route.fulfill(json(200, { dates: [base, '2099-01-28', '2099-02-28'] }));
  }
  if (method === 'POST' && path === '/recurring-templates') {
    const body = request.postDataJSON() as Json;
    const template = makeTemplate(800 + state.templates.length, String(body['name']));
    state.templates.push(template);
    return route.fulfill(json(201, template));
  }
  const action = /^\/recurring-templates\/([^/]+)\/(pause|resume)$/.exec(path);
  if (method === 'POST' && action) {
    const template = state.templates.find((t) => t['id'] === action[1]);
    if (!template) return route.fulfill(problem(404, 'NOT_FOUND'));
    template['status'] = action[2] === 'pause' ? 'paused' : 'active';
    return route.fulfill(json(200, template));
  }
  return route.fallback();
}

async function handleAdmin(route: Route, path: string, method: string, state: Sprint3State) {
  if (method === 'GET' && path === '/admin/metrics') {
    return route.fulfill(
      json(200, {
        generatedAt: STAMP,
        users: {
          total: state.users.length,
          active30d: 1,
          new30d: 1,
          suspended: state.suspendedIds.length,
          admins: 1,
        },
        wallets: { total: 2, active: 2 },
        transactions: { total: 10, last30d: 5 },
        recurringTemplates: { active: 1 },
      }),
    );
  }
  if (method === 'GET' && path === '/admin/users') {
    const items = state.users;
    return route.fulfill(
      json(200, { items, page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 }),
    );
  }
  const one = /^\/admin\/users\/([^/]+)(?:\/(suspend|reactivate))?$/.exec(path);
  if (one) {
    const user = state.users.find((u) => u['id'] === one[1]);
    if (!user) return route.fulfill(problem(404, 'NOT_FOUND'));
    if (method === 'POST' && one[2] === 'suspend') {
      user['status'] = 'suspended';
      user['suspendedAt'] = STAMP;
      state.suspendedIds.push(String(user['id']));
    }
    if (method === 'POST' && one[2] === 'reactivate') user['status'] = 'active';
    return route.fulfill(json(200, { ...user, suspendedReason: null, activeSessionCount: 1 }));
  }
  if (method === 'GET' && path === '/admin/audit-logs') {
    return route.fulfill(json(200, { items: [], nextCursor: null }));
  }
  return route.fallback();
}

/** Registers after installFakeApi, so it sees requests first and falls back for the rest. */
export async function installSprint3Api(
  page: Page,
  api: FakeApi,
  state: Sprint3State,
): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();

    if (method === 'POST' && path === '/auth/refresh' && state.role === 'admin' && api.signedIn) {
      return route.fulfill(json(200, adminSession()));
    }
    if (path.startsWith('/budgets')) return handleBudgets(route, path, method, api, state);
    if (path.startsWith('/recurring-templates')) return handleRecurring(route, path, method, state);
    if (path.startsWith('/admin/')) return handleAdmin(route, path, method, state);
    if (method === 'GET' && path === '/reports/summary') {
      return route.fulfill(json(200, summary(api, state)));
    }
    if (method === 'GET' && path === '/reports/trend') {
      const start = `${TODAY.slice(0, 8)}01`;
      return route.fulfill(
        json(200, {
          from: start,
          to: TODAY,
          groupBy: 'week',
          currency: 'USD',
          buckets: [
            {
              periodStart: start,
              periodEnd: TODAY,
              incomeMinor: 420000,
              expenseMinor: 310040,
              netMinor: 109960,
            },
          ],
        }),
      );
    }
    if (method === 'GET' && path === '/reports/category-breakdown') {
      return route.fulfill(
        json(200, {
          from: `${TODAY.slice(0, 8)}01`,
          to: TODAY,
          type: 'expense',
          currency: 'USD',
          totalMinor: 310040,
          items: [
            {
              category: ref(CATEGORIES[0]!),
              amountMinor: 310040,
              percentage: 100,
              transactionCount: 4,
            },
          ],
          other: null,
        }),
      );
    }
    if (method === 'GET' && path === '/transactions/export') {
      state.exportRequests.push(url.search);
      return route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        headers: {
          'Content-Disposition': 'attachment; filename="midas-transactions-20261016.csv"',
        },
        body: '﻿date,type\n2026-10-16,expense\n',
      });
    }
    return route.fallback();
  });
}
