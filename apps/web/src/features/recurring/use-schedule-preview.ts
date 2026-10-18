import type { RecurringFrequency } from '@midas/shared';
import { PREVIEW_COUNT_DEFAULT, PREVIEW_COUNT_MAX } from '@midas/shared/recurring';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useDebounced } from '@/lib/use-debounced';
import { previewSchedule } from './api';

export interface PreviewInput {
  frequency: RecurringFrequency;
  interval: number | null;
  startDate: string;
  endDate: string | null;
  /** The form is valid enough to ask. */
  valid: boolean;
}

export interface SchedulePreview {
  /** The next dates (on or after today), at most five. */
  next: string[];
  /** Occurrences between the start date and today that will be added after saving. */
  earlier: number;
  /** More earlier dates than the preview could list. */
  earlierCapped: boolean;
  isFetching: boolean;
  isError: boolean;
  settled: boolean;
}

export function splitPreview(
  dates: readonly string[],
  today: string,
): Pick<SchedulePreview, 'next' | 'earlier' | 'earlierCapped'> {
  const earlier = dates.filter((date) => date < today).length;
  return {
    next: dates.filter((date) => date >= today).slice(0, PREVIEW_COUNT_DEFAULT),
    earlier,
    earlierCapped: dates.length >= PREVIEW_COUNT_MAX && earlier === dates.length,
  };
}

/**
 * Live "next dates" from POST /recurring-templates/preview, debounced 300ms (ui-design 5.9). A
 * start date in the past is previewed from that date so the catch-up count is known.
 */
export function useSchedulePreview(input: PreviewInput, today: string): SchedulePreview {
  // Debounce a primitive key, not the (fresh-every-render) input object: an object identity
  // would restart the timer on every render and never settle.
  const key = JSON.stringify(input);
  const debouncedKey = useDebounced(key, 300);
  const debounced = useMemo(() => JSON.parse(debouncedKey) as PreviewInput, [debouncedKey]);
  const past = debounced.startDate < today;
  const enabled = debounced.valid && debounced.interval !== null;
  const query = useQuery({
    enabled,
    queryKey: [
      'recurring',
      'preview',
      debounced.frequency,
      debounced.interval,
      debounced.startDate,
      debounced.endDate,
      today,
    ],
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      previewSchedule(
        {
          frequency: debounced.frequency,
          interval: debounced.interval ?? 1,
          startDate: debounced.startDate,
          ...(debounced.endDate ? { endDate: debounced.endDate } : {}),
          ...(past ? { fromDate: debounced.startDate } : {}),
          count: past ? PREVIEW_COUNT_MAX : PREVIEW_COUNT_DEFAULT,
        },
        signal,
      ),
  });
  const split = splitPreview(query.data ?? [], today);
  return {
    ...split,
    isFetching: query.isFetching,
    isError: query.isError,
    settled: enabled && query.isSuccess && debouncedKey === key,
  };
}
