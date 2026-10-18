import type { AuditLogEntry } from '@midas/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { safeMetadata } from './audit-metadata';
import { actionLabel, utcStamp } from './audit-search';

function Detail({ entry }: { entry: AuditLogEntry }) {
  const { rows, hidden } = safeMetadata(entry.action, entry.metadata);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
      <dt className="text-ink-3">IP</dt>
      <dd>{entry.ip ?? '-'}</dd>
      <dt className="text-ink-3">User agent</dt>
      <dd className="break-all">{entry.userAgent ?? '-'}</dd>
      <dt className="text-ink-3">Request</dt>
      <dd className="break-all font-mono text-mono">{entry.requestId ?? '-'}</dd>
      <dt className="text-ink-3">Target id</dt>
      <dd className="break-all font-mono text-mono">{entry.target.id ?? '-'}</dd>
      {rows.length === 0 ? (
        <>
          <dt className="text-ink-3">Metadata</dt>
          <dd>{hidden > 0 ? 'Not shown' : 'None'}</dd>
        </>
      ) : (
        rows.map(({ key, label, value }) => (
          <div key={key} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="whitespace-pre-wrap break-words">{value}</dd>
          </div>
        ))
      )}
      {rows.length > 0 && hidden > 0 ? (
        <>
          <dt className="text-ink-3">Other fields</dt>
          <dd>Not shown</dd>
        </>
      ) : null}
    </dl>
  );
}

function Row({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const detailId = `audit-detail-${entry.id}`;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <>
      <tr className="border-b border-line align-top" data-audit-row={entry.id}>
        <td className="tabular py-2 pr-3 whitespace-nowrap">{utcStamp(entry.occurredAt)}</td>
        <td className="max-w-48 truncate py-2 pr-3" title={entry.actor?.email}>
          {entry.actor ? entry.actor.email : <span className="text-ink-3">System</span>}
        </td>
        <td className="py-2 pr-3">
          {actionLabel(entry.action)}
          <span className="block font-mono text-mono text-ink-3">{entry.action}</span>
        </td>
        <td className="py-2 pr-3">
          {entry.target.type}
          {entry.target.id ? ` ${entry.target.id.slice(0, 8)}` : ''}
        </td>
        <td className="py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-8 items-center gap-1 rounded-sm text-primary underline underline-offset-2 pointer-coarse:min-h-11"
          >
            <Chevron aria-hidden="true" className="size-4" />
            Details <span className="sr-only">for {actionLabel(entry.action)}</span>
          </button>
        </td>
      </tr>
      {open ? (
        <tr id={detailId} className="border-b border-line bg-sunken/40">
          <td colSpan={5} className="p-3">
            <Detail entry={entry} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function AuditTable({ entries }: { entries: readonly AuditLogEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">Audit log, newest first, times in UTC</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-2">
            <th scope="col" className="py-2 pr-3 font-medium">
              Time (UTC)
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Actor
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Action
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Target
            </th>
            <th scope="col" className="py-2 font-medium">
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <Row key={entry.id} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
