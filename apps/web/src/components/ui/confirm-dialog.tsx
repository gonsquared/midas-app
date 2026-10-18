import { useId, useRef, useState, type ReactNode } from 'react';
import { ApiErrorAlert } from './api-error-alert';
import { Button } from './button';
import { Dialog, DialogContent } from './dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A question that names the object, for example "Archive Checking?". */
  title: string;
  /** Effects of the action, one short item each. */
  consequences?: readonly ReactNode[];
  /** Extra content between the consequences and the buttons (step 2 of a flow, a picker). */
  children?: ReactNode;
  reversibleNote?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'primary';
  /** Runs on confirm. A rejection keeps the dialog open and is shown as an alert. */
  onConfirm: () => Promise<void> | void;
  /** An error the caller already mapped to copy; takes precedence over a thrown error. */
  error?: ReactNode;
  /** Keeps the button focusable (aria-disabled) and explains why in `confirmHint`. */
  confirmBlocked?: boolean;
  confirmHint?: string;
  /** Rendered next to the buttons, for example a secondary escape hatch. */
  extraActions?: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Destructive-action confirmation (ui-design 7.2, 18.0.2): an alertdialog whose first focus is the
 * safe action. The confirm button shows loading and ignores repeat activation; failures keep the
 * dialog open.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequences = [],
  children,
  reversibleNote,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmTone = 'danger',
  onConfirm,
  error,
  confirmBlocked = false,
  confirmHint,
  extraActions,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  const hintId = useId();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const confirm = async () => {
    if (pending || confirmBlocked) return;
    setPending(true);
    setFailure(null);
    try {
      await onConfirm();
    } catch (caught) {
      setFailure(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setFailure(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        title={title}
        role="alertdialog"
        describedBy={bodyId}
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <div id={bodyId} className="flex flex-col gap-3 text-body-sm text-ink-2">
          {consequences.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {consequences.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : null}
          {children}
          {reversibleNote ? <p className="text-ink">{reversibleNote}</p> : null}
        </div>
        {error ?? null}
        {!error && failure ? <ApiErrorAlert error={failure} /> : null}
        <div className="flex flex-col gap-2">
          {confirmBlocked && confirmHint ? (
            <p id={hintId} className="text-body-sm text-ink-3">
              {confirmHint}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {extraActions}
            <Button ref={cancelRef} variant="secondary" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              variant={confirmTone}
              loading={pending}
              aria-disabled={confirmBlocked || undefined}
              aria-describedby={confirmBlocked && confirmHint ? hintId : undefined}
              onClick={() => void confirm()}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
