import { Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useCrossTabSignOut } from '@/features/auth/hooks';

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
  // Overlay child routes (/wallets/new) share their parent's page, so they must not re-announce
  // the page or pull focus out of the dialog that just opened.
  const pageKey = useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i -= 1) {
        const match = state.matches[i];
        if (match?.staticData.title) return match.routeId;
      }
      return state.location.pathname;
    },
  });
  const [announcement, setAnnouncement] = useState('');
  const initial = useRef(true);

  useEffect(() => {
    if (title) document.title = `${title} | ${TITLE_SUFFIX}`;
    if (initial.current) {
      initial.current = false;
      return;
    }
    setAnnouncement(title ?? '');
    // A lazily loaded page may not have rendered its h1 yet: retry briefly.
    let attempts = 0;
    let timer: number | undefined;
    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) heading.focus();
      else if (attempts < 40) {
        attempts += 1;
        timer = window.setTimeout(focusHeading, 50);
      }
    };
    focusHeading();
    return () => window.clearTimeout(timer);
  }, [pageKey, title]);

  return announcement;
}

export function RootLayout() {
  const announcement = usePageChrome();
  useCrossTabSignOut();
  return (
    <>
      <Outlet />
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
