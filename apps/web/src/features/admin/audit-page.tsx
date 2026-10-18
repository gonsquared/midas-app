import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@midas/shared/enums';
import type { AuditAction, AuditTargetType } from '@midas/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced } from '@/lib/use-debounced';
import { AdminHeader, PrivacyLine } from './admin-ui';
import { useAuditLogs } from './api';
import { ACTION_LABELS, isReversedRange, parseAuditSearch, type AuditSearch } from './audit-search';
import { AuditTable } from './audit-table';

export function AdminAuditPage() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => parseAuditSearch(raw), [JSON.stringify(raw)]);
  const navigate = useNavigate();
  const [actor, setActor] = useState(search.actor ?? '');
  const debounced = useDebounced(actor.trim(), 400);

  const go = (patch: Partial<AuditSearch>) => {
    const next: AuditSearch = { ...search, ...patch };
    for (const key of Object.keys(next) as Array<keyof AuditSearch>) {
      if (next[key] === undefined || next[key] === '') delete next[key];
    }
    void navigate({ to: '/admin/audit', search: next as never, replace: true });
  };
  useEffect(() => {
    if (debounced !== (search.actor ?? '')) go({ actor: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const reversed = isReversedRange(search);
  const query = useAuditLogs(
    {
      actorEmail: search.actor,
      action: search.action,
      targetType: search.target ? 'user' : search.targetType,
      targetId: search.target,
      // A reversed range is never sent; the To field explains it.
      from: reversed ? undefined : search.from,
      to: reversed ? undefined : search.to,
    },
    !reversed,
  );
  const entries = query.data?.pages.flatMap((page) => page.items) ?? [];

  let body;
  if (reversed) {
    body = <p className="py-6 text-body text-ink-2">Choose a range that ends after it starts.</p>;
  } else if (query.isPending) body = <Skeleton className="h-64" aria-busy="true" />;
  else if (query.isError) {
    body = (
      <ApiErrorAlert
        error={query.error}
        message="Couldn't load the audit log."
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (entries.length === 0) {
    body = <p className="py-6 text-body text-ink-2">No audit entries match these filters.</p>;
  } else {
    body = (
      <>
        <AuditTable entries={entries} />
        {query.hasNextPage ? (
          <Button
            variant="secondary"
            className="mt-4"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </Button>
        ) : (
          <p className="mt-3 text-caption text-ink-3">End of the log.</p>
        )}
      </>
    );
  }

  return (
    <div>
      <AdminHeader title="Audit log">
        <p className="text-body-sm text-ink-3">Entries are kept for 400 days.</p>
      </AdminHeader>
      <PrivacyLine />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FieldFrame id="audit-actor" label="Actor email">
          {(control) => (
            <Input
              {...control}
              type="search"
              autoComplete="off"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
            />
          )}
        </FieldFrame>
        <FieldFrame id="audit-action" label="Action">
          {(control) => (
            <NativeSelect
              {...control}
              value={search.action ?? ''}
              onChange={(v) => go({ action: (v || undefined) as AuditAction | undefined })}
              options={[
                { value: '', label: 'Any action' },
                ...AUDIT_ACTIONS.map((a) => ({ value: a, label: ACTION_LABELS[a] })),
              ]}
            />
          )}
        </FieldFrame>
        <FieldFrame id="audit-target-type" label="Target type">
          {(control) => (
            <NativeSelect
              {...control}
              value={search.targetType ?? ''}
              onChange={(v) => go({ targetType: (v || undefined) as AuditTargetType | undefined })}
              options={[
                { value: '', label: 'Any target' },
                ...AUDIT_TARGET_TYPES.map((t) => ({ value: t, label: t })),
              ]}
            />
          )}
        </FieldFrame>
        <FieldFrame id="audit-from" label="From (UTC day)">
          {(control) => (
            <Input
              {...control}
              type="date"
              value={search.from ?? ''}
              onChange={(event) => go({ from: event.target.value || undefined })}
            />
          )}
        </FieldFrame>
        <FieldFrame
          id="audit-to"
          label="To (UTC day)"
          error={reversed ? 'The end date must be on or after the start date.' : undefined}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              value={search.to ?? ''}
              onChange={(event) => go({ to: event.target.value || undefined })}
            />
          )}
        </FieldFrame>
      </div>
      {search.target ? (
        <p className="mb-3 text-body-sm text-ink-2">
          Showing entries for user {search.target.slice(0, 8)}.{' '}
          <Button variant="link" onClick={() => go({ target: undefined })}>
            Clear
          </Button>
        </p>
      ) : null}
      {body}
    </div>
  );
}
