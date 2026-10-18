import { Info } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { formatLocalDate } from '@/lib/dates';
import { isClamped, type ScheduleLike } from './schedule';
import type { SchedulePreview } from './use-schedule-preview';

/** The live "Next dates" list with the month-end note and the catch-up notice (ui-design 5.9). */
export function SchedulePreviewList({
  preview,
  schedule,
  locale,
  ready,
}: {
  preview: SchedulePreview;
  schedule: ScheduleLike;
  locale: string;
  ready: boolean;
}) {
  const anyClamped = preview.next.some((date) => isClamped(date, schedule));
  let content;
  if (!ready) {
    content = <p className="text-body-sm text-ink-3">Fix the schedule to see the next dates.</p>;
  } else if (preview.isError) {
    content = <p className="text-body-sm text-ink-3">Next dates are unavailable right now.</p>;
  } else if (!preview.settled && preview.next.length === 0) {
    content = (
      <p className="flex items-center gap-2 text-body-sm text-ink-3">
        <Spinner /> Calculating...
      </p>
    );
  } else if (preview.next.length === 0) {
    content = <p className="text-body-sm text-ink-3">No more dates: the schedule has ended.</p>;
  } else {
    content = (
      <ol className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
        {preview.next.map((date) => (
          <li key={date} className="flex items-center gap-2">
            <span>
              {formatLocalDate(date, locale, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            {isClamped(date, schedule) ? (
              <span className="inline-flex items-center gap-1 text-caption text-info">
                <Info aria-hidden="true" className="size-3.5" />
                Moved to the last day of the month
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-sunken/40 p-3">
      <h3 className="text-body-sm font-medium text-ink-2">Next dates</h3>
      <div aria-live="polite" aria-busy={preview.isFetching || undefined}>
        {content}
      </div>
      {anyClamped ? (
        <p className="text-caption text-ink-3">
          Dates that don&apos;t exist in a month move to its last day.
        </p>
      ) : null}
      {ready && preview.earlier > 0 ? (
        <Alert variant="info">
          {preview.earlierCapped ? 'At least ' : ''}
          {preview.earlier} earlier {preview.earlier === 1 ? 'date' : 'dates'} will be added shortly
          after you save.
        </Alert>
      ) : null}
    </div>
  );
}
