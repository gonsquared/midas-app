import * as RadixTabs from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn('flex gap-1 border-b border-line', className)} {...props} />;
}

/** Selected tab: 3px primary bottom edge plus aria-selected, never color alone. */
export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'inline-flex min-h-11 items-center gap-2 px-4 text-body-sm font-medium text-ink-2 hover:bg-sunken',
        'data-[state=active]:font-semibold data-[state=active]:text-ink',
        'data-[state=active]:shadow-[inset_0_-3px_0_var(--color-primary)]',
        className,
      )}
      {...props}
    />
  );
}
