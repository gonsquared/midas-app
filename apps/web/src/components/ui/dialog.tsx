import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { resolveOpener } from '@/lib/use-return-focus';
import { IconButton } from './icon-button';

/**
 * CSP note: a modal Radix Dialog renders react-remove-scroll, which injects a <style> element at
 * runtime. The production CSP is style-src 'self' (no 'unsafe-inline'), so that is blocked.
 * Instead the Dialog runs in Radix's non-modal mode (no RemoveScroll) and this file supplies the
 * modal pieces itself: a scrim that swallows outside pointer events (and dismisses), aria-modal,
 * a body class for the scroll lock (styled in index.css, so no injected CSS), Tab looping, Esc
 * and focus return, which Radix keeps in non-modal mode, and the `inert` attribute on everything
 * behind the dialog (what the modal mode's aria-hidden would do for assistive technology). See
 * CONTRIBUTING.md (CSP).
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

/** How many open dialogs currently hold each background element inert. */
const inertHolds = new Map<Element, number>();
/** Elements that were already inert before any dialog touched them: never un-inerted by us. */
const ownInert = new Set<Element>();

/** The direct child of <body> that contains the node (the Radix portal wrapper). */
function bodyChildOf(node: Element): Element | null {
  let current: Element | null = node;
  while (current && current.parentElement !== document.body) current = current.parentElement;
  return current;
}

/**
 * Makes everything outside this dialog's portal inert, so the background leaves the accessibility
 * tree and the tab order. Reference counted: stacked dialogs inert each other's layers, and the
 * background comes back only when the last dialog closes. Needs no CSS, so it is CSP-safe.
 */
function InertBackground({ contentRef }: { contentRef: RefObject<HTMLElement | null> }): null {
  useEffect(() => {
    const content = contentRef.current;
    const ownRoot = content ? bodyChildOf(content) : null;
    const held: Element[] = [];
    for (const element of Array.from(document.body.children)) {
      if (element === ownRoot || element.tagName === 'SCRIPT') continue;
      const holds = inertHolds.get(element) ?? 0;
      if (holds === 0) {
        if (element.hasAttribute('inert')) continue;
        element.setAttribute('inert', '');
        ownInert.add(element);
      } else if (!ownInert.has(element)) {
        continue;
      }
      inertHolds.set(element, holds + 1);
      held.push(element);
    }
    return () => {
      for (const element of held) {
        const holds = (inertHolds.get(element) ?? 1) - 1;
        if (holds > 0) {
          inertHolds.set(element, holds);
          continue;
        }
        inertHolds.delete(element);
        ownInert.delete(element);
        element.removeAttribute('inert');
      }
    };
  }, [contentRef]);
  return null;
}

export interface DialogContentProps {
  title: string;
  description?: string;
  children?: ReactNode;
  /**
   * "dialog" is centered; "sheet" slides from the bottom edge on small screens; "drawer" is the
   * 440px panel on the right edge (the transaction composer).
   */
  variant?: 'dialog' | 'sheet' | 'drawer';
  className?: string;
  /** Use "alertdialog" for destructive confirmations. */
  role?: 'dialog' | 'alertdialog';
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  /** Hides the close button (confirmations that must be answered with their own buttons). */
  hideClose?: boolean;
  /** Id of an element inside the dialog that describes it (used instead of description). */
  describedBy?: string;
  /** Visually hide the visible title while keeping it as the accessible name. */
  titleHidden?: boolean;
}

/**
 * A confirmation dialog opened from inside another dialog is a sibling portal, so moving focus or
 * pressing inside it looks like an "outside" interaction to the first dialog. Only the scrim and
 * real outside targets may dismiss it.
 */
function ignoreNestedLayers(event: { target: EventTarget | null; preventDefault: () => void }) {
  const target = event.target;
  if (target instanceof Element && target.closest('[role="alertdialog"]')) event.preventDefault();
}

const VARIANT_CLASSES = {
  dialog:
    'top-1/2 left-1/2 max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-dialog-in rounded-lg',
  sheet:
    'inset-x-0 bottom-0 max-h-[92dvh] animate-toast-in rounded-t-lg pb-[calc(1.25rem+env(safe-area-inset-bottom))]',
  drawer:
    'inset-y-0 right-0 h-dvh w-full max-w-[27.5rem] animate-toast-in rounded-l-lg max-md:max-w-none max-md:rounded-none',
} as const;

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
  role,
  onOpenAutoFocus,
  onCloseAutoFocus,
  hideClose = false,
  titleHidden = false,
  describedBy,
}: DialogContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  return (
    <RadixDialog.Portal>
      <ScrollLock />
      <InertBackground contentRef={contentRef} />
      {/* Non-modal Radix renders no overlay, so this is the scrim. Pointer-down on it counts as
          outside the content and closes the dialog, like the modal version. */}
      <div
        aria-hidden="true"
        data-testid="dialog-scrim"
        className="fixed inset-0 z-60 animate-fade-in bg-scrim"
      />
      <RadixDialog.Content
        ref={contentRef}
        aria-modal="true"
        onFocusOutside={ignoreNestedLayers}
        onInteractOutside={ignoreNestedLayers}
        {...(role ? { role } : {})}
        {...(describedBy
          ? { 'aria-describedby': describedBy }
          : description
            ? {}
            : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(event) => {
          // Remember what had focus before the dialog took it (see onCloseAutoFocus).
          opener.current = resolveOpener(document.activeElement);
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          // Non-modal Radix only restores focus to a <Dialog.Trigger>. Dialogs opened from a
          // route link or from state have none, so focus would fall to <body> (WCAG 2.4.3).
          // Callers with their own handling (useReturnFocus) call preventDefault and win.
          event.preventDefault();
          // Only when focus was actually lost: if something else already took it (a second dialog
          // opened from this one, a route change that focused the heading) leave it alone.
          const active = document.activeElement;
          if (active && active !== document.body) return;
          const target = opener.current;
          if (!target || target === document.body) return;
          if (target.isConnected) target.focus();
          else document.querySelector<HTMLElement>('main h1')?.focus();
        }}
        className={cn(
          'fixed z-60 flex flex-col gap-4 overflow-y-auto border border-line bg-raised p-5 text-ink shadow-dialog',
          VARIANT_CLASSES[variant],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title
              className={cn('font-display text-heading font-semibold', titleHidden && 'sr-only')}
            >
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-body-sm text-ink-2">
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>
          {hideClose ? null : (
            <RadixDialog.Close asChild>
              <IconButton label="Close" size="sm" icon={<X className="size-4" />} />
            </RadixDialog.Close>
          )}
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
