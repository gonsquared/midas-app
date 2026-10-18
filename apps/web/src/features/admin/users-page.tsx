import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreferences } from '@/lib/preferences';
import { useSession } from '@/lib/session';
import { useDebounced } from '@/lib/use-debounced';
import { useReturnFocus } from '@/lib/use-return-focus';
import { AdminHeader, PrivacyLine } from './admin-ui';
import { useAdminUsers } from './api';
import { UserDetailDialog } from './user-detail-dialog';
import { UsersFilters } from './users-filters';
import { DEFAULT_SORT, PAGE_SIZES, parseUsersSearch, type UsersSearch } from './users-search';
import { UsersTable } from './users-table';

export function AdminUsersPage() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => parseUsersSearch(raw), [JSON.stringify(raw)]);
  const navigate = useNavigate();
  const { locale } = usePreferences();
  const { user: me } = useSession();
  const { capture, restore } = useReturnFocus();
  const [text, setText] = useState(search.q ?? '');
  const debounced = useDebounced(text.trim(), 300);

  const go = (patch: Partial<UsersSearch>, resetPage = true) => {
    const next: UsersSearch = { ...search, ...(resetPage ? { page: undefined } : {}), ...patch };
    for (const key of Object.keys(next) as Array<keyof UsersSearch>) {
      if (next[key] === undefined || next[key] === '') delete next[key];
    }
    void navigate({ to: '/admin/users', search: next as never, replace: true });
  };
  // The last query this box pushed to the URL; a different URL value came from outside
  // (back/forward, a link) and the box follows it.
  const pushed = useRef(search.q ?? '');
  useEffect(() => {
    if (debounced !== (search.q ?? '')) {
      pushed.current = debounced;
      go({ q: debounced || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    const fromUrl = search.q ?? '';
    if (fromUrl !== pushed.current) {
      pushed.current = fromUrl;
      setText(fromUrl);
    }
  }, [search.q]);

  const pageSize = search.pageSize ?? 25;
  const query = useAdminUsers({
    q: search.q,
    role: search.role,
    status: search.status,
    sort: search.sort ?? DEFAULT_SORT,
    page: search.page ?? 1,
    pageSize,
  });
  const data = query.data;
  const first = data && data.totalItems > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, data.totalItems) : 0;

  return (
    <div>
      <AdminHeader title="Users" />
      <PrivacyLine />
      <UsersFilters search={search} text={text} onText={setText} onChange={go} />
      <div aria-live="polite" className="mb-2 text-body-sm text-ink-2">
        {data ? `Showing ${first}-${last} of ${data.totalItems}` : 'Loading users.'}
      </div>
      {query.isPending ? (
        <Skeleton className="h-64" aria-busy="true" />
      ) : query.isError || !data ? (
        <ApiErrorAlert
          error={query.error}
          message="Couldn't load users."
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      ) : data.items.length === 0 ? (
        <p className="py-6 text-body text-ink-2">No users match these filters.</p>
      ) : (
        <>
          <UsersTable
            users={data.items}
            currentUserId={me?.id}
            locale={locale}
            onOpen={(u) => {
              capture();
              go({ user: u.id }, false);
            }}
          />
          <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => go({ page: data.page - 1 || undefined }, false)}
            >
              Previous page
            </Button>
            <span className="tabular text-body-sm">
              Page {data.page} of {Math.max(data.totalPages, 1)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={data.page >= data.totalPages}
              onClick={() => go({ page: data.page + 1 }, false)}
            >
              Next page
            </Button>
            <FieldFrame id="user-page-size" label="Rows per page" className="ml-auto">
              {(control) => (
                <NativeSelect
                  {...control}
                  value={String(pageSize)}
                  onChange={(v) => go({ pageSize: Number(v) })}
                  options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                />
              )}
            </FieldFrame>
          </nav>
        </>
      )}
      {search.user ? (
        <UserDetailDialog
          userId={search.user}
          currentUserId={me?.id}
          onClose={() => go({ user: undefined }, false)}
          onCloseAutoFocus={restore}
        />
      ) : null}
    </div>
  );
}
