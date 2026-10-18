import type {
  Budget,
  BudgetListResponse,
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from '@midas/shared';
import { BudgetListResponseSchema, BudgetSchema } from '@midas/shared/budgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const BUDGETS_KEY = ['budgets'] as const;

export function fetchBudgets(date: string, signal?: AbortSignal): Promise<BudgetListResponse> {
  return api.request('/budgets', {
    query: { date },
    parser: BudgetListResponseSchema,
    ...(signal ? { signal } : {}),
  });
}

/** Budgets with the status of the period that contains `date` (a LocalDate). */
export function useBudgets(date: string) {
  return useQuery({
    queryKey: [...BUDGETS_KEY, 'list', date],
    queryFn: ({ signal }) => fetchBudgets(date, signal),
  });
}

export const createBudget = (input: CreateBudgetRequest): Promise<Budget> =>
  api.request('/budgets', { method: 'POST', body: input, parser: BudgetSchema });

export const updateBudget = (id: string, input: UpdateBudgetRequest): Promise<Budget> =>
  api.request(`/budgets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    parser: BudgetSchema,
  });

export const deleteBudget = (id: string): Promise<void> =>
  api.request(`/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Budget create, edit and delete refresh budgets and the report summary (ui-design 7.5). */
export function useInvalidateBudgets() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['reports', 'summary'] }),
    ]);
}
