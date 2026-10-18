import type { AdminUser } from '@midas/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatStamp, StatusBadge } from './user-detail-dialog';

export function UsersTable({
  users,
  currentUserId,
  locale,
  onOpen,
}: {
  users: readonly AdminUser[];
  currentUserId: string | undefined;
  locale: string;
  onOpen: (user: AdminUser) => void;
}) {
  const th = 'sticky top-0 bg-surface py-2 pr-3 font-medium';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">Users</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-2">
            <th scope="col" className={th}>
              User
            </th>
            <th scope="col" className={th}>
              Role
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Joined
            </th>
            <th scope="col" className={th}>
              Last sign-in
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} data-user-row={user.id} className="border-b border-line align-top">
              <th scope="row" className="max-w-64 py-2 pr-3 text-left font-normal">
                <span className="block truncate font-medium" dir="auto" title={user.displayName}>
                  {user.displayName}
                  {user.id === currentUserId ? (
                    <Badge variant="info" className="ml-2">
                      You
                    </Badge>
                  ) : null}
                </span>
                <span className="block truncate text-ink-3" title={user.email}>
                  {user.email}
                </span>
              </th>
              <td className="py-2 pr-3">{user.role === 'admin' ? 'Admin' : 'User'}</td>
              <td className="py-2 pr-3">
                <StatusBadge status={user.status} />
              </td>
              <td className="py-2 pr-3">
                {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(user.createdAt),
                )}
              </td>
              <td className="py-2 pr-3">{formatStamp(user.lastLoginAt, locale)}</td>
              <td className="py-2">
                <Button variant="secondary" size="sm" onClick={() => onOpen(user)}>
                  Manage <span className="sr-only">{user.displayName}</span>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
