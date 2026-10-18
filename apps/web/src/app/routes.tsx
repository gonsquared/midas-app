import {
  createRootRoute,
  createRoute,
  lazyRouteComponent,
  notFound,
  redirect,
  type AnyRoute,
} from '@tanstack/react-router';
import { restoreSession } from '@/features/auth/api';
import { parseCategoriesSearch } from '@/features/categories/search';
import { parseTransactionsSearch } from '@/features/transactions/filters';
import { parseWalletsSearch } from '@/features/wallets/search';
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { ResetPasswordPage } from '@/features/auth/reset-password-page';
import { isAuthReason, type AuthReason } from '@/features/auth/strings';
import { DEFAULT_RETURN_PATH, safeReturnPath } from '@/lib/redirect';
import { isUuid } from '@/lib/uuid';
import { getSessionSnapshot, setSession } from '@/lib/session';
import { NotFoundPage } from '@/routes/not-found-page';
import { PlaceholderPage } from '@/routes/placeholder-page';
import { PublicLayout } from '@/routes/public-pages';
import { ErrorFallback } from './error-boundary';
import { RootLayout } from './root-layout';
import { AppShell } from './shell/app-shell';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Page title: sets document.title and the route announcement. */
    title?: string;
  }
}

/** The post-sign-in return target for a guarded location (dropped when it is just the dashboard). */
function loginSearchFor(href: string | undefined): { redirect?: string } {
  const target = safeReturnPath(href);
  return target === DEFAULT_RETURN_PATH ? {} : { redirect: target };
}

/**
 * Protected-route guard: use the in-memory session, else try the refresh cookie, else send the
 * visitor to sign in carrying a validated return path.
 */
export async function requireSession(location?: { href: string }): Promise<void> {
  if (getSessionSnapshot().user) return;
  // __DEV_SKIP_AUTH__ is a compile-time constant, hard false in builds (see vite.config.ts), so
  // this branch and the dynamically imported fake session are removed from the bundle.
  if (__DEV_SKIP_AUTH__) {
    const { DEV_SESSION } = await import('@/lib/dev-session');
    setSession(DEV_SESSION);
    return;
  }
  const session = await restoreSession();
  if (!session) throw redirect({ to: '/login', search: loginSearchFor(location?.href) });
}

/** Signed-in visitors have no business on the sign-in and register screens. */
async function redirectIfSignedIn(): Promise<void> {
  if (getSessionSnapshot().user) throw redirect({ to: '/dashboard' });
  // A reload keeps the refresh cookie but not the in-memory session: restore it before deciding.
  if (!__DEV_SKIP_AUTH__ && (await restoreSession())) throw redirect({ to: '/dashboard' });
}

function requireAdmin(): void {
  // Non-admins get the standard Not found page: no hint that the area exists.
  if (getSessionSnapshot().user?.role !== 'admin') throw notFound();
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <main id="main-content" tabIndex={-1}>
      <NotFoundPage />
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main id="main-content" tabIndex={-1}>
      <ErrorFallback onRetry={reset} />
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ location }) => {
    await requireSession(location);
    throw redirect({ to: '/dashboard' });
  },
});

const publicLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: '_public',
  component: PublicLayout,
});

interface LoginSearch {
  redirect?: string;
  reason?: AuthReason;
}

/** Only a safe in-app path survives validation (the redirect is validated again on use). */
function validateLoginSearch(search: Record<string, unknown>): LoginSearch {
  const result: LoginSearch = {};
  if (typeof search['redirect'] === 'string') {
    const safe = safeReturnPath(search['redirect']);
    if (safe !== DEFAULT_RETURN_PATH) result.redirect = safe;
  }
  if (isAuthReason(search['reason'])) result.reason = search['reason'];
  return result;
}

const loginRoute = createRoute({
  getParentRoute: () => publicLayout,
  path: '/login',
  staticData: { title: 'Sign in' },
  validateSearch: validateLoginSearch,
  beforeLoad: redirectIfSignedIn,
  component: function LoginRoute() {
    const search = loginRoute.useSearch();
    return <LoginPage {...search} />;
  },
});

const registerRoute = createRoute({
  getParentRoute: () => publicLayout,
  path: '/register',
  staticData: { title: 'Create account' },
  beforeLoad: redirectIfSignedIn,
  component: RegisterPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => publicLayout,
  path: '/forgot-password',
  staticData: { title: 'Forgot password' },
  component: ForgotPasswordPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => publicLayout,
  path: '/reset-password',
  staticData: { title: 'Reset password' },
  component: ResetPasswordPage,
});

const appLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: ({ location }) => requireSession(location),
  component: AppShell,
  notFoundComponent: NotFoundPage,
  errorComponent: ({ reset }) => (
    <main id="main-content" tabIndex={-1}>
      <ErrorFallback onRetry={reset} />
    </main>
  ),
});

function appPage<TParent extends AnyRoute, TPath extends string>(
  parent: TParent,
  path: TPath,
  title: string,
  summary: string,
) {
  return createRoute({
    getParentRoute: () => parent,
    path,
    staticData: { title },
    component: () => <PlaceholderPage title={title} summary={summary} />,
  });
}

const page = <TPath extends string>(path: TPath, title: string, summary: string) =>
  appPage(appLayout, path, title, summary);

const adminRoute = createRoute({
  getParentRoute: () => appLayout,
  path: '/admin',
  beforeLoad: requireAdmin,
});
const adminPage = <TPath extends string>(path: TPath, title: string, summary: string) =>
  appPage(adminRoute, path, title, summary);

// Wallet dialogs are overlay child routes: the page stays mounted and reads the URL (ui-design 18.1.2).
const walletsRoute = createRoute({
  getParentRoute: () => appLayout,
  path: '/wallets',
  staticData: { title: 'Wallets' },
  validateSearch: parseWalletsSearch,
  component: lazyRouteComponent(() => import('@/features/wallets/wallets-page'), 'WalletsPage'),
});
const walletsNewRoute = createRoute({ getParentRoute: () => walletsRoute, path: '/new' });
const walletsEditRoute = createRoute({
  getParentRoute: () => walletsRoute,
  path: '/$walletId/edit',
});

const categoriesRoute = createRoute({
  getParentRoute: () => appLayout,
  path: '/categories',
  staticData: { title: 'Categories' },
  validateSearch: parseCategoriesSearch,
  component: lazyRouteComponent(
    () => import('@/features/categories/categories-page'),
    'CategoriesPage',
  ),
});
const categoriesNewRoute = createRoute({ getParentRoute: () => categoriesRoute, path: '/new' });
const categoriesEditRoute = createRoute({
  getParentRoute: () => categoriesRoute,
  path: '/$categoryId/edit',
});

const transactionsRoute = createRoute({
  getParentRoute: () => appLayout,
  path: '/transactions',
  staticData: { title: 'Transactions' },
  validateSearch: parseTransactionsSearch,
  component: lazyRouteComponent(
    () => import('@/features/transactions/transactions-page'),
    'TransactionsPage',
  ),
});
// Deep links from the sitemap keep working and open the overlays (ui-design 18.3.2).
const transactionsNewRedirect = createRoute({
  getParentRoute: () => appLayout,
  path: '/transactions/new',
  beforeLoad: () => {
    throw redirect({ to: '/transactions', search: { compose: 'expense' }, replace: true });
  },
});
const transactionsIdRedirect = createRoute({
  getParentRoute: () => appLayout,
  path: '/transactions/$transactionId',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/transactions',
      search: isUuid(params.transactionId) ? { tx: params.transactionId } : {},
      replace: true,
    });
  },
});

const designSystemRoute = import.meta.env.DEV
  ? createRoute({
      getParentRoute: () => rootRoute,
      path: '/design-system',
      staticData: { title: 'Design system' },
      component: lazyRouteComponent(
        () => import('@/features/design-system/design-system-page'),
        'DesignSystemPage',
      ),
    })
  : null;

export const routeTree = rootRoute.addChildren([
  indexRoute,
  publicLayout.addChildren([loginRoute, registerRoute, forgotPasswordRoute, resetPasswordRoute]),
  appLayout.addChildren([
    page(
      '/dashboard',
      'Dashboard',
      'Your overview of money in, money out and budgets will appear here.',
    ),
    transactionsRoute,
    transactionsNewRedirect,
    transactionsIdRedirect,
    walletsRoute.addChildren([walletsNewRoute, walletsEditRoute]),
    categoriesRoute.addChildren([categoriesNewRoute, categoriesEditRoute]),
    page('/budgets', 'Budgets', 'Your spending limits and pace will appear here.'),
    page('/recurring', 'Recurring', 'Your repeating transactions will appear here.'),
    page('/reports', 'Reports', 'Trends and breakdowns will appear here.'),
    createRoute({
      getParentRoute: () => appLayout,
      path: '/settings',
      staticData: { title: 'Settings' },
      component: lazyRouteComponent(
        () => import('@/features/settings/settings-page'),
        'SettingsPage',
      ),
    }),
    adminRoute.addChildren([
      adminPage('/', 'Administration', 'Platform totals will appear here.'),
      adminPage('/users', 'Users', 'Account status and roles will appear here.'),
      adminPage('/categories', 'Default categories', 'Default categories will appear here.'),
      adminPage('/audit', 'Audit log', 'Administrative activity will appear here.'),
    ]),
  ]),
  ...(designSystemRoute ? [designSystemRoute] : []),
]);
