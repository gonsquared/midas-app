import { useRouterState } from '@tanstack/react-router';
import { cn } from '@/lib/cn';
import { AddMenu } from './add-menu';
import type { Breakpoint } from './use-breakpoint';
import { UserMenu } from './user-menu';

/** App header. In any /admin route it gets the 3px brass edge and an Administration label. */
export function Header({ breakpoint }: { breakpoint: Breakpoint }) {
  const inAdmin = useRouterState({ select: (s) => s.location.pathname.startsWith('/admin') });
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-14 items-center gap-3 bg-canvas px-4 md:px-6 lg:px-8',
        inAdmin ? 'border-b-[3px] border-brass' : 'border-b border-line',
      )}
    >
      {breakpoint !== 'desktop' ? (
        <span className="font-display text-heading font-semibold md:hidden">Midas</span>
      ) : null}
      {inAdmin ? <span className="text-body-sm font-medium text-ink-2">Administration</span> : null}
      <div className="ml-auto flex items-center gap-3">
        {breakpoint !== 'mobile' ? <AddMenu /> : null}
        <UserMenu />
      </div>
    </header>
  );
}
