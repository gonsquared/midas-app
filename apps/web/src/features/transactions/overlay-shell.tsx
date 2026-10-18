import { useState, type ReactNode } from 'react';
import { useBreakpoint } from '@/app/shell/use-breakpoint';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * Drawer (md and up) or sheet (mobile) for the composer and the transaction detail. A dirty form
 * asks "Discard this transaction?" before Esc, the scrim or the close button dismiss it.
 */
export function OverlayShell({
  title,
  description,
  dirty,
  onClose,
  discardNoun = 'transaction',
  onOpenAutoFocus,
  children,
}: {
  title: string;
  description?: string;
  dirty: boolean;
  onClose: () => void;
  discardNoun?: string;
  onOpenAutoFocus?: (event: Event) => void;
  children: ReactNode;
}) {
  const breakpoint = useBreakpoint();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (open) return;
          if (dirty) setConfirmDiscard(true);
          else onClose();
        }}
      >
        <DialogContent
          title={title}
          {...(description ? { description } : {})}
          variant={breakpoint === 'mobile' ? 'sheet' : 'drawer'}
          {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
        >
          {children}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={`Discard this ${discardNoun}?`}
        consequences={['Your changes will be lost.']}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
