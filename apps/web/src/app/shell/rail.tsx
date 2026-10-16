import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { ADMIN_NAV, PRIMARY_NAV, type NavGroup } from './nav-config';
import { NavLink } from './nav-link';

function Group({
  group,
  showLabels,
  onNavigate,
  headingLevel = 'p',
}: {
  group: NavGroup;
  showLabels: boolean;
  onNavigate: () => void;
  headingLevel?: 'p' | 'h2';
}) {
  const Heading = headingLevel;
  return (
    <div role="group" aria-label={group.label} className="flex flex-col gap-1">
      {showLabels ? (
        <Heading className="px-3 pt-3 pb-1 text-caption font-medium text-ink-3">
          {group.label}
        </Heading>
      ) : (
        <hr className="mx-3 my-2 border-line" aria-hidden="true" />
      )}
      {group.items.map((item) => {
        const link = (
          <NavLink key={item.to} item={item} showLabel={showLabels} onNavigate={onNavigate} />
        );
        return showLabels ? (
          link
        ) : (
          <Tooltip key={item.to} content={item.label}>
            {link}
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Desktop: 232px rail with labels. Tablet: 64px icon rail (labels as tooltips on hover and
 * keyboard focus) with an expand control that overlays a labelled rail. Esc (unless already
 * handled) or a pointer press outside collapses it.
 */
export function Rail({ mode, isAdmin }: { mode: 'tablet' | 'desktop'; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const showLabels = mode === 'desktop' || expanded;

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Leave Escape alone when something inside (a menu, a dialog) already handled it.
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setExpanded(false);
        expandButton.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [expanded]);

  const collapse = () => setExpanded(false);

  return (
    <div
      ref={rootRef}
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col overflow-y-auto border-r border-line bg-surface',
        showLabels ? 'w-58' : 'w-16',
        expanded && 'shadow-popover',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center px-3',
          showLabels ? 'justify-between' : 'justify-center',
        )}
      >
        {showLabels ? (
          <span className="font-display text-heading font-semibold text-ink">Midas</span>
        ) : null}
        {mode === 'tablet' ? (
          <IconButton
            ref={expandButton}
            label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            icon={
              expanded ? (
                <PanelLeftClose className="size-5" />
              ) : (
                <PanelLeftOpen className="size-5" />
              )
            }
          />
        ) : null}
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-1 px-2 pb-4">
        {PRIMARY_NAV.map((group) => (
          <Group key={group.label} group={group} showLabels={showLabels} onNavigate={collapse} />
        ))}
      </nav>
      {isAdmin ? (
        <nav
          aria-label="Administration"
          className="mt-auto flex flex-col gap-1 border-t border-line px-2 py-3"
        >
          <Group group={ADMIN_NAV} showLabels={showLabels} onNavigate={collapse} />
        </nav>
      ) : null}
    </div>
  );
}
