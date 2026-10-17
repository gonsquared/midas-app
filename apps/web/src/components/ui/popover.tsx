import * as RadixPopover from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * Non-modal popover (same mode as the dropdown menu). Modal Radix popovers mount
 * react-remove-scroll, which injects a style element and is blocked by the strict CSP
 * (ui-design 18.0.1). Positioning uses style properties set through the DOM API, which is allowed.
 */
export function Popover(props: Omit<ComponentProps<typeof RadixPopover.Root>, 'modal'>) {
  return <RadixPopover.Root {...props} modal={false} />;
}
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'z-65 rounded-md border border-line bg-raised text-ink shadow-popover outline-none',
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  );
}
