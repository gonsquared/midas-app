import { createMemoryHistory, createRouter, type RouterHistory } from '@tanstack/react-router';
import { parseSearch, stringifySearch } from '@/lib/search-params';
import { routeTree } from './routes';

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    parseSearch,
    stringifySearch,
    defaultPreload: 'intent',
    scrollRestoration: true,
    ...(options.history ? { history: options.history } : {}),
  });
}

export { createMemoryHistory };

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
