import type { ReactNode } from 'react';
import type { PlatformMetrics } from '@midas/shared';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreferences } from '@/lib/preferences';
import { useAdminMetrics } from './api';
import { AdminHeader, PrivacyLine, ProportionBar, share } from './admin-ui';

function Row({ label, value, children }: { label: string; value: number; children?: ReactNode }) {
  const { locale } = usePreferences();
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-2 last:border-b-0">
      <dt className="text-body-sm text-ink-2">{label}</dt>
      <dd className="tabular font-semibold">{new Intl.NumberFormat(locale).format(value)}</dd>
      {children ? <dd className="m-0 w-full">{children}</dd> : null}
    </div>
  );
}

function Metrics({ m }: { m: PlatformMetrics }) {
  const activeShare = share(m.users.active30d, m.users.total);
  const walletShare = share(m.wallets.active, m.wallets.total);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="metrics-accounts"
        className="rounded-md border border-line bg-surface p-4"
      >
        <h2 id="metrics-accounts" className="mb-2 font-display text-heading">
          Accounts
        </h2>
        <dl className="m-0">
          <Row label="Total accounts" value={m.users.total} />
          <Row label="Active in last 30 days" value={m.users.active30d}>
            <ProportionBar
              percent={activeShare}
              label={`${activeShare}% of accounts were active in the last 30 days`}
            />
            <p className="text-caption text-ink-3">{activeShare}% of all accounts</p>
          </Row>
          <Row label="New in last 30 days" value={m.users.new30d} />
          <Row label="Suspended" value={m.users.suspended} />
          <Row label="Administrators" value={m.users.admins} />
        </dl>
      </section>
      <section
        aria-labelledby="metrics-activity"
        className="rounded-md border border-line bg-surface p-4"
      >
        <h2 id="metrics-activity" className="mb-2 font-display text-heading">
          Activity
        </h2>
        <dl className="m-0">
          <Row label="Wallets" value={m.wallets.total}>
            <ProportionBar
              percent={walletShare}
              label={`${walletShare}% of wallets are active (${m.wallets.active} of ${m.wallets.total})`}
            />
            <p className="text-caption text-ink-3">
              {m.wallets.active} active ({walletShare}%)
            </p>
          </Row>
          <Row label="Transactions" value={m.transactions.total} />
          <Row label="Added in last 30 days" value={m.transactions.last30d} />
          <Row label="Active recurring items" value={m.recurringTemplates.active} />
        </dl>
      </section>
    </div>
  );
}

export function AdminOverviewPage() {
  const { locale } = usePreferences();
  const { data, isPending, isError, error, refetch } = useAdminMetrics();
  const updated = data
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(data.generatedAt),
      )
    : null;
  return (
    <div>
      <AdminHeader title="Administration">
        {updated ? <p className="text-body-sm text-ink-3">Updated {updated}</p> : null}
      </AdminHeader>
      <PrivacyLine />
      {isPending ? (
        <Skeleton className="h-64" aria-busy="true" />
      ) : isError ? (
        <ApiErrorAlert
          error={error}
          message="Couldn't load platform totals."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <Metrics m={data} />
          <p className="mt-3 text-caption text-ink-3">Totals are cached for up to 5 minutes.</p>
        </>
      )}
    </div>
  );
}
