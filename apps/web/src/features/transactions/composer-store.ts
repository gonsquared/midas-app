import { useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import type { ComposeType } from './filters';

/** Values a composer opens with (Duplicate, "Move money from here"). Held in memory only. */
export interface ComposerPrefill {
  walletId?: string;
  categoryId?: string;
  amountMinor?: number;
  occurredOn?: string;
  note?: string | null;
  fromWalletId?: string;
  toWalletId?: string;
  toAmountMinor?: number;
}

let pendingPrefill: ComposerPrefill | null = null;

export function setComposerPrefill(prefill: ComposerPrefill | null): void {
  pendingPrefill = prefill;
}

export function peekComposerPrefill(): ComposerPrefill | null {
  return pendingPrefill;
}

export function clearComposerPrefill(): void {
  pendingPrefill = null;
}

/**
 * History state carried by an entry the app pushed to open an overlay. Closing calls back() only
 * when the current entry has it, so a pasted link or a link that already navigated away is never
 * "undone" by closing.
 */
export const OVERLAY_HISTORY_STATE = { midasOverlay: true } as const;

/** Test hook: forget session state between tests. */
export function resetComposerSession(): void {
  pendingPrefill = null;
}

type SearchRecord = Record<string, unknown>;

/**
 * Open and close the composer / transaction detail overlays on any page (ui-design 18.3.2).
 * Opening pushes a history entry so Back closes the overlay. Closing pops that entry when the
 * overlay was opened in this session and replaces the URL otherwise (a pasted link).
 */
export function useOverlays() {
  const navigate = useNavigate();
  const router = useRouter();

  const open = useCallback(
    (key: 'compose' | 'tx', value: string, prefill?: ComposerPrefill) => {
      pendingPrefill = prefill ?? null;
      void navigate({
        to: '.',
        state: (() => OVERLAY_HISTORY_STATE) as never,
        search: ((prev: SearchRecord) => ({
          ...prev,
          compose: undefined,
          tx: undefined,
          [key]: value,
        })) as never,
      });
    },
    [navigate],
  );

  const openCompose = useCallback(
    (type: ComposeType, prefill?: ComposerPrefill) => open('compose', type, prefill),
    [open],
  );
  const openTransaction = useCallback((id: string) => open('tx', id), [open]);

  const closeOverlay = useCallback(() => {
    pendingPrefill = null;
    const state = router.state.location.state as unknown as Record<string, unknown> | undefined;
    if (state?.['midasOverlay'] === true) {
      router.history.back();
      return;
    }
    void navigate({
      to: '.',
      replace: true,
      search: ((prev: SearchRecord) => ({ ...prev, compose: undefined, tx: undefined })) as never,
    });
  }, [navigate, router]);

  /** Swap the overlay in place (type switch inside the composer) without growing history. */
  const replaceCompose = useCallback(
    (type: ComposeType) => {
      void navigate({
        to: '.',
        replace: true,
        state: true,
        search: ((prev: SearchRecord) => ({ ...prev, tx: undefined, compose: type })) as never,
      });
    },
    [navigate],
  );

  return { openCompose, openTransaction, closeOverlay, replaceCompose };
}
