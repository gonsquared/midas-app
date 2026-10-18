import { useCallback, useRef } from 'react';

/**
 * The element focus should return to. Called from a menu item's onSelect the focused element is
 * the item, which is unmounted as the menu closes: use the menu's trigger (Radix labels the menu
 * with the trigger id) so focus lands on the row's Actions button.
 */
export function resolveOpener(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement)) return null;
  const menu = active.closest('[role="menu"]');
  const triggerId = menu?.getAttribute('aria-labelledby');
  const trigger = triggerId ? document.getElementById(triggerId) : null;
  return trigger ?? active;
}

/**
 * Focus return for overlays that are opened from state instead of a Radix trigger: call
 * `capture()` from the click that opens the overlay, and pass `restore` as `onCloseAutoFocus`.
 * When the opener is gone (a deleted row) focus lands on the page heading (ui-design 18.0.3).
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  const capture = useCallback((target?: HTMLElement | null) => {
    opener.current = target ?? resolveOpener(document.activeElement);
  }, []);
  const restore = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target?.isConnected) target.focus();
    else document.querySelector<HTMLElement>('main h1')?.focus();
  }, []);
  return { capture, restore };
}
