import * as Menu from '@radix-ui/react-dropdown-menu';
import { useRef } from 'react';
import { ArrowLeftRight, ChevronDown, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOverlays } from '@/features/transactions/composer-store';
import { cn } from '@/lib/cn';

const ADD_ACTIONS = [
  { label: 'Expense', type: 'expense', icon: TrendingDown },
  { label: 'Income', type: 'income', icon: TrendingUp },
  { label: 'Transfer', type: 'transfer', icon: ArrowLeftRight },
] as const;

export const menuContentClass =
  'z-40 min-w-44 rounded-md border border-line bg-raised p-1 text-ink shadow-popover';
export const menuItemClass =
  'flex h-9 cursor-default items-center gap-2 rounded-sm px-2 text-body-sm outline-none ' +
  'data-[highlighted]:bg-sunken data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 ' +
  'data-[highlighted]:outline-focus-ring pointer-coarse:h-11';

/** The single global action: opens the composer on the current page (?compose=). */
export function AddMenu({ variant = 'header' }: { variant?: 'header' | 'bar' }) {
  const { openCompose } = useOverlays();
  const chose = useRef(false);
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        {variant === 'bar' ? (
          <button
            type="button"
            aria-label="Add"
            className={cn(
              'inline-flex size-12 items-center justify-center rounded-md bg-primary text-on-primary',
              'transition-colors duration-[140ms] hover:bg-primary-hover active:translate-y-px',
            )}
          >
            <Plus aria-hidden="true" className="size-6" />
          </button>
        ) : (
          <Button>
            <Plus aria-hidden="true" className="size-4" />
            Add
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className={menuContentClass}
          // After choosing a type the composer takes focus; the menu must not pull it back.
          onCloseAutoFocus={(event) => {
            if (chose.current) event.preventDefault();
            chose.current = false;
          }}
        >
          {ADD_ACTIONS.map(({ label, type, icon: Icon }) => (
            <Menu.Item
              key={label}
              className={menuItemClass}
              onSelect={() => {
                chose.current = true;
                openCompose(type);
              }}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
