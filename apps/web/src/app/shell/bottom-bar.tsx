import { Link } from '@tanstack/react-router';
import { Ellipsis, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useSignOut } from '@/features/auth/hooks';
import { useThemeSetting } from '@/features/settings/use-theme-setting';
import { cn } from '@/lib/cn';
import { isThemePreference, THEME_PREFERENCES, type ThemePreference } from '@/lib/theme';
import { AddMenu } from './add-menu';
import { ADMIN_NAV, BOTTOM_BAR_ITEMS, MORE_ITEMS } from './nav-config';
import { NavLink } from './nav-link';

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

const barItemClass =
  'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-caption ' +
  'font-medium text-ink-2 data-[status=active]:text-primary';

function MoreSheet({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const { preference, setTheme } = useThemeSetting();
  const signOut = useSignOut();
  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={cn(barItemClass, 'bg-transparent')}>
          <Ellipsis aria-hidden="true" className="size-5" />
          More
        </button>
      </DialogTrigger>
      <DialogContent title="More" variant="sheet">
        <nav aria-label="More" className="flex flex-col gap-1">
          {MORE_ITEMS.map((item) => (
            <NavLink key={item.to} item={item} showLabel onNavigate={close} />
          ))}
        </nav>
        {isAdmin ? (
          <nav
            aria-label="Administration"
            className="flex flex-col gap-1 border-t border-line pt-3"
          >
            <p className="px-3 text-caption font-medium text-ink-3">{ADMIN_NAV.label}</p>
            {ADMIN_NAV.items.map((item) => (
              <NavLink key={item.to} item={item} showLabel onNavigate={close} />
            ))}
          </nav>
        ) : null}
        <div role="group" aria-label="Theme" className="flex gap-2 border-t border-line pt-3">
          {THEME_PREFERENCES.map((value) => {
            const Icon = THEME_ICONS[value];
            const selected = preference === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  if (isThemePreference(value)) void setTheme(value);
                }}
                className={cn(
                  'flex h-11 flex-1 items-center justify-center gap-2 rounded-md border text-body-sm',
                  selected ? 'border-primary bg-primary-tint font-medium' : 'border-line-strong',
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {THEME_LABELS[value]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            close();
            void signOut();
          }}
          className="flex h-11 items-center gap-3 rounded-md px-3 text-body-sm font-medium text-ink hover:bg-sunken"
        >
          <LogOut aria-hidden="true" className="size-5" />
          Sign out
        </button>
      </DialogContent>
    </Dialog>
  );
}

/** Mobile bottom bar: Home, Activity, Add (center), Budgets, More. Labels are always visible. */
export function BottomBar({ isAdmin }: { isAdmin: boolean }) {
  const [home, activity, budgets] = BOTTOM_BAR_ITEMS;
  const items = [home, activity, null, budgets];
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] items-center gap-1 border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)] max-md:landscape:h-[calc(3rem+env(safe-area-inset-bottom))]"
    >
      {items.map((item) =>
        item ? (
          <Link key={item.to} to={item.to} className={barItemClass}>
            <item.icon aria-hidden="true" className="size-5" />
            {item.label}
          </Link>
        ) : (
          <div key="add" className="flex flex-1 justify-center">
            <AddMenu variant="bar" />
          </div>
        ),
      )}
      <MoreSheet isAdmin={isAdmin} />
    </nav>
  );
}
