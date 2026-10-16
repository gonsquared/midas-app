import { Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

export const TITLE_SUFFIX = 'Midas';

/**
 * Route-change accessibility (ui-design 10.2): update the document title, announce the page in a
 * polite live region and move focus to the new page h1. Skipped for the initial load.
 */
function usePageChrome(): string {
  const title = useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i -= 1) {
        const found = state.matches[i]?.staticData.title;
        if (found) return found;
      }
      return undefined;
    },
  });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [announcement, setAnnouncement] = useState('');
  const initial = useRef(true);

  useEffect(() => {
    if (title) document.title = `${title} | ${TITLE_SUFFIX}`;
    if (initial.current) {
      initial.current = false;
      return;
    }
    setAnnouncement(title ?? '');
    document.querySelector<HTMLElement>('main h1')?.focus();
  }, [pathname, title]);

  return announcement;
}

export function RootLayout() {
  const announcement = usePageChrome();
  return (
    <>
      <Outlet />
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
