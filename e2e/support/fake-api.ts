import type { Page, Route } from '@playwright/test';

/** Minimal in-memory stand-in for the Midas API, shaped like docs/api-contract.md. */
interface Wallet {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalanceMinor: number;
  balanceMinor: number;
  archived: boolean;
  archivedAt: string | null;
  hasTransactions: boolean;
  createdAt: string;
  updatedAt: string;
}

const STAMP = '2026-10-01T00:00:00.000Z';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const user = {
  id: uuid(1),
  email: 'kim@example.com',
  displayName: 'Kim Morgan',
  role: 'user',
  status: 'active',
  preferences: { currency: 'USD', locale: 'en-US', timezone: 'UTC', theme: 'light' },
  createdAt: STAMP,
  updatedAt: STAMP,
};

const session = () => ({
  accessToken: 'e2e-access-token',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  user,
});

const category = (n: number, name: string, type: string, icon: string, color: string) => ({
  id: uuid(n),
  name,
  type,
  icon,
  color,
  system: true,
  retired: false,
  createdAt: STAMP,
  updatedAt: STAMP,
});

export const CATEGORIES = [
  category(100, 'Groceries', 'expense', 'shopping-cart', 'green'),
  category(101, 'Salary', 'income', 'briefcase', 'blue'),
];

export interface FakeApi {
  /** Whether the refresh cookie is considered valid (a signed-in browser). */
  signedIn: boolean;
  wallets: Wallet[];
  transactions: Array<Record<string, unknown>>;
  requests: string[];
}

export function makeWallet(n: number, name: string, balanceMinor = 0): Wallet {
  return {
    id: uuid(n),
    name,
    type: 'bank',
    currency: 'USD',
    openingBalanceMinor: balanceMinor,
    balanceMinor,
    archived: false,
    archivedAt: null,
    hasTransactions: false,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

const problem = (status: number, code: string, errors?: unknown[]) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({
    type: 'about:blank',
    title: code,
    status,
    detail: code,
    instance: '/api/v1',
    code,
    requestId: 'req-e2e-0001',
    ...(errors ? { errors } : {}),
  }),
});

const json = (status: number, body: unknown) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

export async function installFakeApi(page: Page, initial: Partial<FakeApi> = {}): Promise<FakeApi> {
  const state: FakeApi = {
    signedIn: false,
    wallets: [],
    transactions: [],
    requests: [],
    ...initial,
  };

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    state.requests.push(`${method} ${path}`);
    const body = request.postDataJSON?.() as Record<string, unknown> | null;

    if (method === 'POST' && path === '/auth/refresh') {
      return route.fulfill(state.signedIn ? json(200, session()) : problem(401, 'SESSION_INVALID'));
    }
    if (method === 'POST' && (path === '/auth/login' || path === '/auth/register')) {
      state.signedIn = true;
      return route.fulfill(json(path === '/auth/login' ? 200 : 201, session()));
    }
    if (method === 'POST' && path === '/auth/logout') {
      state.signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (method === 'GET' && path === '/wallets')
      return route.fulfill(json(200, { items: state.wallets }));
    if (method === 'GET' && path === '/categories')
      return route.fulfill(json(200, { items: CATEGORIES }));
    if (method === 'POST' && path === '/wallets') {
      const wallet = makeWallet(
        200 + state.wallets.length,
        String(body?.['name']),
        Number(body?.['openingBalanceMinor'] ?? 0),
      );
      Object.assign(wallet, { type: body?.['type'], currency: body?.['currency'] ?? 'USD' });
      state.wallets.push(wallet);
      return route.fulfill(json(201, wallet));
    }
    const archive = /^\/wallets\/([^/]+)\/archive$/.exec(path);
    if (method === 'POST' && archive) {
      const wallet = state.wallets.find((w) => w.id === archive[1]);
      if (wallet) Object.assign(wallet, { archived: true, archivedAt: STAMP });
      return route.fulfill(json(200, wallet));
    }
    if (method === 'GET' && path === '/transactions') {
      const types = url.searchParams.getAll('type');
      const q = url.searchParams.get('q')?.toLowerCase();
      const items = state.transactions.filter(
        (t) =>
          (types.length === 0 || types.includes(String(t['type']))) &&
          (!q ||
            String(t['note'] ?? '')
              .toLowerCase()
              .includes(q)),
      );
      return route.fulfill(json(200, { items, nextCursor: null }));
    }
    if (method === 'POST' && path === '/transactions') {
      const wallet = state.wallets.find((w) => w.id === body?.['walletId']);
      const cat = CATEGORIES.find((c) => c.id === body?.['categoryId']);
      const sign = body?.['type'] === 'income' ? 1 : -1;
      if (wallet)
        Object.assign(wallet, {
          balanceMinor: wallet.balanceMinor + sign * Number(body?.['amountMinor']),
          hasTransactions: true,
        });
      const tx = {
        id: uuid(500 + state.transactions.length),
        type: body?.['type'],
        wallet: { id: wallet?.id, name: wallet?.name, currency: 'USD', archived: false },
        category: cat,
        amountMinor: body?.['amountMinor'],
        currency: 'USD',
        occurredOn: body?.['occurredOn'],
        note: body?.['note'] ?? null,
        transfer: null,
        recurringTemplateId: null,
        createdAt: STAMP,
        updatedAt: STAMP,
      };
      state.transactions.unshift(tx);
      return route.fulfill(json(201, tx));
    }
    return route.fulfill(problem(404, 'NOT_FOUND'));
  });

  return state;
}
