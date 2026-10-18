import type { AdminUserDetail } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAnnounce } from '@/components/ui/announcer';
import { usePreferences } from '@/lib/preferences';
import { useAdminUser } from './api';
import { UserActionDialog, type UserAction } from './user-actions';

export function formatStamp(iso: string | null, locale: string): string {
  if (!iso) return 'Never';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function StatusBadge({ status }: { status: AdminUserDetail['status'] }) {
  return status === 'active' ? (
    <Badge variant="success">Active</Badge>
  ) : (
    <Badge variant="danger">Suspended</Badge>
  );
}

export interface UserDetailDialogProps {
  userId: string;
  currentUserId: string | undefined;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function UserDetailDialog({
  userId,
  currentUserId,
  onClose,
  onCloseAutoFocus,
}: UserDetailDialogProps) {
  const { locale } = usePreferences();
  const { toast } = useToast();
  const announce = useAnnounce();
  const query = useAdminUser(userId);
  const [action, setAction] = useState<UserAction | null>(null);
  const user = query.data;
  const isSelf = userId === currentUserId;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          title={user ? user.displayName : 'User details'}
          variant="drawer"
          {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        >
          {query.isPending ? (
            <Skeleton className="h-40" aria-busy="true" />
          ) : query.isError || !user ? (
            <ApiErrorAlert error={query.error} message="Couldn't load this user." />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={user.status} />
                <Badge variant="neutral">{user.role === 'admin' ? 'Admin' : 'User'}</Badge>
                {isSelf ? <Badge variant="info">You</Badge> : null}
              </div>
              <p className="break-all text-body-sm text-ink-2">{user.email}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
                <dt className="text-ink-3">Joined</dt>
                <dd>{formatStamp(user.createdAt, locale)}</dd>
                <dt className="text-ink-3">Last sign-in</dt>
                <dd>{formatStamp(user.lastLoginAt, locale)}</dd>
                <dt className="text-ink-3">Active sessions</dt>
                <dd className="tabular">{user.activeSessionCount}</dd>
                {user.suspendedAt ? (
                  <>
                    <dt className="text-ink-3">Suspended</dt>
                    <dd>
                      {formatStamp(user.suspendedAt, locale)}
                      {user.suspendedReason ? (
                        <span className="block whitespace-pre-wrap">
                          Reason: {user.suspendedReason}
                        </span>
                      ) : null}
                    </dd>
                  </>
                ) : null}
              </dl>
              {isSelf ? (
                <p className="text-body-sm text-ink-2">
                  You can&apos;t change your own role or status.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {user.status === 'active' ? (
                    <Button variant="danger" onClick={() => setAction('suspend')}>
                      Suspend
                    </Button>
                  ) : (
                    <Button onClick={() => setAction('reactivate')}>Reactivate</Button>
                  )}
                  {user.role === 'user' ? (
                    <Button variant="secondary" onClick={() => setAction('promote')}>
                      Make administrator
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => setAction('demote')}>
                      Remove administrator access
                    </Button>
                  )}
                </div>
              )}
              <Link
                to="/admin/audit"
                search={{ target: user.id }}
                className="text-body-sm font-medium text-primary underline underline-offset-2"
              >
                View audit trail
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {action && user ? (
        <UserActionDialog
          user={user}
          action={action}
          onClose={() => setAction(null)}
          onDone={(_updated, message) => {
            setAction(null);
            announce(message);
            toast({ variant: 'success', title: message });
          }}
        />
      ) : null}
    </>
  );
}
