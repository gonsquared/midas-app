import { createMemoryHistory, createRouter, type RouterHistory } from '@tanstack/react-router';
import { routeTree } from './routes';

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
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
