import {
  createRootRoute,
  createRoute,
  lazyRouteComponent,
  notFound,
  redirect,
  type AnyRoute,
} from '@tanstack/react-router';
import { restoreSession } from '@/features/auth/api';
import { getSessionSnapshot, setSession } from '@/lib/session';
import { NotFoundPage } from '@/routes/not-found-page';
import { PlaceholderPage } from '@/routes/placeholder-page';
import { AuthPlaceholder, PublicLayout } from '@/routes/public-pages';
import { ErrorFallback } from './error-boundary';
import { RootLayout } from './root-layout';
import { AppShell } from './shell/app-shell';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Page title: sets document.title and the route announcement. */
    title?: string;
  }
}

/** Protected-route guard: use the in-memory session, else try the refresh cookie, else sign in. */
export async function requireSession(): Promise<void> {
  if (getSessionSnapshot().user) return;
  // __DEV_SKIP_AUTH__ is a compile-time constant, hard false in builds (see vite.config.ts), so
  // this branch and the dynamically imported fake session are removed from the bundle.
  if (__DEV_SKIP_AUTH__) {
    const { DEV_SESSION } = await import('@/lib/dev-session');
    setSession(DEV_SESSION);
    return;
  }
  const session = await restoreSession();
  if (!session) throw redirect({ to: '/login' });
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
  beforeLoad: async () => {
    await requireSession();
    throw redirect({ to: '/dashboard' });
  },
});

const publicLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: '_public',
  component: PublicLayout,
});

function publicPage<TPath extends string>(path: TPath, title: string, summary: string) {
  return createRoute({
    getParentRoute: () => publicLayout,
    path,
    staticData: { title },
    component: () => <AuthPlaceholder title={title} summary={summary} />,
  });
}

const appLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: requireSession,
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
  publicLayout.addChildren([
    publicPage('/login', 'Sign in', 'Sign in arrives with the accounts feature.'),
    publicPage('/register', 'Create account', 'Registration arrives with the accounts feature.'),
    publicPage(
      '/forgot-password',
      'Forgot password',
      'Password reset arrives with the accounts feature.',
    ),
    publicPage(
      '/reset-password',
      'Reset password',
      'Password reset arrives with the accounts feature.',
    ),
  ]),
  appLayout.addChildren([
    page(
      '/dashboard',
      'Dashboard',
      'Your overview of money in, money out and budgets will appear here.',
    ),
    page(
      '/transactions',
      'Transactions',
      'Your ledger of income, expenses and transfers will appear here.',
    ),
    page('/wallets', 'Wallets', 'Your accounts and balances will appear here.'),
    page('/categories', 'Categories', 'Your income and expense categories will appear here.'),
    page('/budgets', 'Budgets', 'Your spending limits and pace will appear here.'),
    page('/recurring', 'Recurring', 'Your repeating transactions will appear here.'),
    page('/reports', 'Reports', 'Trends and breakdowns will appear here.'),
    page('/settings', 'Settings', 'Profile, preferences and security will appear here.'),
    adminRoute.addChildren([
      adminPage('/', 'Administration', 'Platform totals will appear here.'),
      adminPage('/users', 'Users', 'Account status and roles will appear here.'),
      adminPage('/categories', 'Default categories', 'Default categories will appear here.'),
      adminPage('/audit', 'Audit log', 'Administrative activity will appear here.'),
    ]),
  ]),
  ...(designSystemRoute ? [designSystemRoute] : []),
]);
