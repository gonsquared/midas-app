import type { AdminUserDetail } from '@midas/shared';
import { SUSPEND_REASON_MAX_LENGTH } from '@midas/shared/admin';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FieldFrame, Textarea } from '@/components/ui/form-field';
import { ApiError } from '@/lib/api-client';
import { changeUserRole, reactivateUser, suspendUser, useInvalidateAdmin } from './api';

function conflictMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'CANNOT_MODIFY_SELF') return "You can't change your own role or status.";
  if (error.code === 'LAST_ADMIN') return 'There must be at least one active administrator.';
  return null;
}

export type UserAction = 'suspend' | 'reactivate' | 'promote' | 'demote';

export interface UserActionDialogProps {
  user: AdminUserDetail;
  action: UserAction;
  onClose: () => void;
  onDone: (user: AdminUserDetail, message: string) => void;
}

/** One confirmation per action; a 409 stays inside the dialog as an inline error. */
export function UserActionDialog({ user, action, onClose, onDone }: UserActionDialogProps) {
  const invalidate = useInvalidateAdmin();
  const [reason, setReason] = useState('');
  const [inline, setInline] = useState<string | null>(null);
  const name = user.displayName;

  const copy = {
    suspend: {
      title: `Suspend ${name}?`,
      confirm: 'Suspend account',
      tone: 'danger' as const,
      lines: [
        'They will be signed out on every device now.',
        "They can't sign in until you reactivate them.",
        "Their data is not changed and you can't see it.",
      ],
      done: 'Account suspended. They were signed out on all devices.',
    },
    reactivate: {
      title: `Reactivate ${name}?`,
      confirm: 'Reactivate account',
      tone: 'primary' as const,
      lines: ['They can sign in again straight away.'],
      done: 'Account reactivated.',
    },
    promote: {
      title: `Make ${name} an administrator?`,
      confirm: 'Make administrator',
      tone: 'primary' as const,
      lines: [
        'Administrators can manage accounts, default categories and see the audit log.',
        "They still cannot see anyone's transactions.",
      ],
      done: `${name} is now an administrator.`,
    },
    demote: {
      title: `Remove administrator access from ${name}?`,
      confirm: 'Remove administrator access',
      tone: 'danger' as const,
      lines: ['They keep their account but lose all administration tools.'],
      done: `${name} is no longer an administrator.`,
    },
  }[action];

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={copy.title}
      consequences={copy.lines}
      confirmLabel={copy.confirm}
      confirmTone={copy.tone}
      error={inline ? <Alert variant="danger">{inline}</Alert> : undefined}
      onConfirm={async () => {
        setInline(null);
        try {
          const updated =
            action === 'suspend'
              ? await suspendUser(user.id, reason.trim() || undefined)
              : action === 'reactivate'
                ? await reactivateUser(user.id)
                : await changeUserRole(user.id, action === 'promote' ? 'admin' : 'user');
          await invalidate();
          onDone(updated, copy.done);
        } catch (caught) {
          const message = conflictMessage(caught);
          if (message) {
            setInline(message);
            return;
          }
          throw caught;
        }
      }}
    >
      {action === 'suspend' ? (
        <FieldFrame
          id="suspend-reason"
          label="Reason (optional)"
          meta={`${reason.length} / ${SUSPEND_REASON_MAX_LENGTH}`}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={SUSPEND_REASON_MAX_LENGTH}
              autoComplete="off"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FieldFrame>
      ) : null}
    </ConfirmDialog>
  );
}
