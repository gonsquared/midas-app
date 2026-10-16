import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './icon-button';

/**
 * CSP note: a modal Radix Dialog renders react-remove-scroll, which injects a <style> element at
 * runtime. The production CSP is style-src 'self' (no 'unsafe-inline'), so that is blocked.
 * Instead the Dialog runs in Radix's non-modal mode (no RemoveScroll) and this file supplies the
 * modal pieces itself: a scrim that swallows outside pointer events (and dismisses), aria-modal,
 * a body class for the scroll lock (styled in index.css, so no injected CSS), Tab looping, Esc
 * and focus return, which Radix keeps in non-modal mode. See CONTRIBUTING.md (CSP).
 */
export function Dialog(props: Omit<ComponentProps<typeof RadixDialog.Root>, 'modal'>) {
  return <RadixDialog.Root {...props} modal={false} />;
}
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

const SCROLL_LOCK_CLASS = 'scroll-locked';
let scrollLocks = 0;

/** Locks page scroll through a body class (reference counted for stacked dialogs). */
function ScrollLock(): null {
  useEffect(() => {
    scrollLocks += 1;
    document.body.classList.add(SCROLL_LOCK_CLASS);
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.classList.remove(SCROLL_LOCK_CLASS);
    };
  }, []);
  return null;
}

export interface DialogContentProps {
  title: string;
  description?: string;
  children?: ReactNode;
  /** `dialog` is centered; `sheet` slides from the bottom edge on small screens. */
  variant?: 'dialog' | 'sheet';
  className?: string;
}

/**
 * Radix Dialog with tokens: scrim, focus trap, Esc to close, focus returns to the trigger.
 * Title is required (accessible name). Description is optional but linked when present.
 */
export function DialogContent({
  title,
  description,
  children,
  variant = 'dialog',
  className,
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <ScrollLock />
      {/* Non-modal Radix renders no overlay, so this is the scrim. Pointer-down on it counts as
          outside the content and closes the dialog, like the modal version. */}
      <div
        aria-hidden="true"
        data-testid="dialog-scrim"
        className="fixed inset-0 z-60 animate-fade-in bg-scrim"
      />
      <RadixDialog.Content
        aria-modal="true"
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed z-60 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto border border-line bg-raised p-5 text-ink shadow-dialog',
          variant === 'dialog'
            ? 'top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-dialog-in rounded-lg'
            : 'inset-x-0 bottom-0 animate-toast-in rounded-t-lg pb-[calc(1.25rem+env(safe-area-inset-bottom))]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title className="font-display text-heading font-semibold">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-body-sm text-ink-2">
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label="Close" size="sm" icon={<X className="size-4" />} />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
