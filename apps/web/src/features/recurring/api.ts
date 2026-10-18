import type {
  CreateRecurringTemplateRequest,
  PreviewRecurringRequest,
  RecurringStatus,
  RecurringTemplate,
  UpdateRecurringTemplateRequest,
} from '@midas/shared';
import {
  PreviewRecurringResponseSchema,
  RecurringRunPageSchema,
  RecurringTemplateListSchema,
  RecurringTemplateSchema,
} from '@midas/shared/recurring';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const RECURRING_KEY = ['recurring'] as const;

export function fetchTemplates(
  status: RecurringStatus | undefined,
  signal?: AbortSignal,
): Promise<RecurringTemplate[]> {
  return api
    .request('/recurring-templates', {
      query: status ? { status } : {},
      parser: RecurringTemplateListSchema,
      ...(signal ? { signal } : {}),
    })
    .then((response) => response.items);
}

/** At most 200 templates, sorted by next run; the page filters by status client side. */
export function useRecurringTemplates() {
  return useQuery({
    queryKey: [...RECURRING_KEY, 'list'],
    queryFn: ({ signal }) => fetchTemplates(undefined, signal),
  });
}

export const createTemplate = (input: CreateRecurringTemplateRequest): Promise<RecurringTemplate> =>
  api.request('/recurring-templates', {
    method: 'POST',
    body: input,
    parser: RecurringTemplateSchema,
  });

export const updateTemplate = (
  id: string,
  input: UpdateRecurringTemplateRequest,
): Promise<RecurringTemplate> =>
  api.request(`/recurring-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    parser: RecurringTemplateSchema,
  });

export const pauseTemplate = (id: string): Promise<RecurringTemplate> =>
  api.request(`/recurring-templates/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
    parser: RecurringTemplateSchema,
  });

export const resumeTemplate = (id: string): Promise<RecurringTemplate> =>
  api.request(`/recurring-templates/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    parser: RecurringTemplateSchema,
  });

export const deleteTemplate = (id: string): Promise<void> =>
  api.request(`/recurring-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });

export function previewSchedule(
  input: PreviewRecurringRequest,
  signal?: AbortSignal,
): Promise<string[]> {
  return api
    .request('/recurring-templates/preview', {
      method: 'POST',
      body: input,
      parser: PreviewRecurringResponseSchema,
      ...(signal ? { signal } : {}),
    })
    .then((response) => response.dates);
}

/** Run history, newest occurrence first, cursor paged. */
export function useTemplateRuns(templateId: string | undefined) {
  return useInfiniteQuery({
    enabled: Boolean(templateId),
    queryKey: [...RECURRING_KEY, 'runs', templateId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.request(`/recurring-templates/${encodeURIComponent(templateId ?? '')}/runs`, {
        query: { limit: 25, ...(pageParam ? { cursor: pageParam } : {}) },
        parser: RecurringRunPageSchema,
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * Template changes refresh the recurring list. Creating or resuming can add catch-up
 * transactions right away, so those pass `{ ledger: true }` to refresh what they touch.
 */
export function useInvalidateRecurring() {
  const queryClient = useQueryClient();
  return async (options: { ledger?: boolean } = {}) => {
    if (options.ledger) {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      void queryClient.invalidateQueries({ queryKey: ['wallets'] });
    }
    await queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
  };
}
