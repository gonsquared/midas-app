import type { RecurringRun, RecurringTemplate } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { CircleCheck, CircleX, SkipForward } from 'lucide-react';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLocalDate } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { useTemplateRuns } from './api';
import { failureSentence } from './schedule';

const OUTCOME = {
  succeeded: { label: 'Added', Icon: CircleCheck },
  failed: { label: 'Failed', Icon: CircleX },
  skipped: { label: 'Skipped', Icon: SkipForward },
} as const;

function RunRow({ run, locale }: { run: RecurringRun; locale: string }) {
  const { label, Icon } = OUTCOME[run.status];
  return (
    <tr className="border-b border-line">
      <th scope="row" className="py-2 pr-3 text-left font-normal">
        {formatLocalDate(run.occurrenceDate, locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </th>
      <td className="py-2 pr-3">
        <span className="inline-flex items-center gap-1">
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </span>
        {run.errorCode ? (
          <span className="block text-caption text-ink-3">{failureSentence(run.errorCode)}</span>
        ) : null}
      </td>
      <td className="tabular py-2 pr-3 text-right">{run.attempts}</td>
      <td className="py-2 text-right">
        {run.transactionId ? (
          <Link
            to="/transactions"
            search={{ tx: run.transactionId }}
            className="text-primary underline underline-offset-2"
          >
            View
          </Link>
        ) : (
          <span className="text-ink-3">-</span>
        )}
      </td>
    </tr>
  );
}

export function RunsDrawer({
  template,
  onClose,
  onCloseAutoFocus,
}: {
  template: RecurringTemplate;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { locale } = usePreferences();
  const runs = useTemplateRuns(template.id);
  const items = runs.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Run history: ${template.name}`}
        variant="drawer"
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      >
        {runs.isPending ? (
          <Skeleton className="h-32" />
        ) : runs.isError ? (
          <ApiErrorAlert error={runs.error} message="Couldn't load the run history." />
        ) : items.length === 0 ? (
          <p className="text-body-sm text-ink-2">Nothing has been added yet.</p>
        ) : (
          <table className="w-full border-collapse text-body-sm">
            <caption className="sr-only">Occurrences of {template.name}</caption>
            <thead>
              <tr className="border-b border-line text-left text-ink-2">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Date
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Outcome
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Attempts
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Transaction
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((run) => (
                <RunRow key={run.id} run={run} locale={locale} />
              ))}
            </tbody>
          </table>
        )}
        {runs.hasNextPage ? (
          <Button
            variant="secondary"
            loading={runs.isFetchingNextPage}
            onClick={() => void runs.fetchNextPage()}
          >
            Load more
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
