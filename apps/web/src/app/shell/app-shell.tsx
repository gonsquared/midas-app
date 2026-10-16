import { Outlet } from '@tanstack/react-router';
import { useSession } from '@/lib/session';
import { Header } from './header';
import { BottomBar } from './bottom-bar';
import { Rail } from './rail';
import { MAIN_ID, SkipLink } from './skip-link';
import { useBreakpoint } from './use-breakpoint';

/**
 * Authenticated frame: skip link, banner, Primary (and Administration) navigation, and one main
 * landmark. Desktop gets the full rail, tablet the icon rail, mobile the bottom bar.
 */
export function AppShell() {
  const breakpoint = useBreakpoint();
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-dvh">
      <SkipLink />
      {breakpoint === 'mobile' ? (
        <BottomBar isAdmin={isAdmin} />
      ) : (
        <Rail mode={breakpoint} isAdmin={isAdmin} />
      )}
      <div className="md:pl-16 lg:pl-58">
        <Header breakpoint={breakpoint} />
        <main
          id={MAIN_ID}
          tabIndex={-1}
          className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-6 md:pb-8 lg:px-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
