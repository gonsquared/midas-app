import * as Menu from '@radix-ui/react-dropdown-menu';
import { useNavigate } from '@tanstack/react-router';
import { LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { useSession } from '@/lib/session';
import { isThemePreference } from '@/lib/theme';
import { useSignOut } from '@/features/auth/hooks';
import { useTheme } from '../theme-provider';
import { menuContentClass, menuItemClass } from './add-menu';

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]];
  return (
    letters
      .map((part) => (part ? Array.from(part)[0] : ''))
      .join('')
      .toUpperCase() || '?'
  );
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function UserMenu() {
  const { user } = useSession();
  const { preference, setPreference } = useTheme();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const name = user?.displayName ?? 'Account';

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={`Account menu for ${name}`}
        className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface text-body-sm font-semibold text-ink hover:bg-sunken pointer-coarse:size-11"
      >
        <span aria-hidden="true">{initialsOf(name)}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={menuContentClass}>
          <Menu.Label className="px-2 py-1.5 text-body-sm font-medium text-ink-2" dir="auto">
            {name}
          </Menu.Label>
          <Menu.Item className={menuItemClass} onSelect={() => void navigate({ to: '/settings' })}>
            <Settings aria-hidden="true" className="size-4" />
            Settings
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Label className="px-2 py-1 text-caption text-ink-3">Theme</Menu.Label>
          <Menu.RadioGroup
            value={preference}
            onValueChange={(value) => {
              if (isThemePreference(value)) setPreference(value);
            }}
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Menu.RadioItem key={value} value={value} className={menuItemClass}>
                <Icon aria-hidden="true" className="size-4" />
                {label}
                <Menu.ItemIndicator className="ml-auto text-primary">
                  <span aria-hidden="true">&#10003;</span>
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item className={menuItemClass} onSelect={() => void signOut()}>
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
