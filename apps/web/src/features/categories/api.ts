import type {
  Category,
  CreateCategoryRequest,
  DeleteCategoryResponse,
  UpdateCategoryRequest,
} from '@midas/shared';
import {
  CategoryListResponseSchema,
  CategorySchema,
  DeleteCategoryResponseSchema,
} from '@midas/shared/categories';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const CATEGORIES_KEY = ['categories'] as const;

export async function fetchCategories(
  includeRetired: boolean,
  signal?: AbortSignal,
): Promise<Category[]> {
  const response = await api.request('/categories', {
    query: includeRetired ? { includeRetired: true } : {},
    parser: CategoryListResponseSchema,
    ...(signal ? { signal } : {}),
  });
  return response.items;
}

/**
 * The Categories page lists current categories only. Transaction views pass includeRetired so
 * old data that references a retired default still shows its name (ui-design 18.3.2).
 */
export function useCategories({ includeRetired = false }: { includeRetired?: boolean } = {}) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, { includeRetired }],
    queryFn: ({ signal }) => fetchCategories(includeRetired, signal),
  });
}

export const createCategory = (input: CreateCategoryRequest): Promise<Category> =>
  api.request('/categories', { method: 'POST', body: input, parser: CategorySchema });

export const updateCategory = (id: string, input: UpdateCategoryRequest): Promise<Category> =>
  api.request(`/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    parser: CategorySchema,
  });

export const deleteCategory = (id: string, reassignTo?: string): Promise<DeleteCategoryResponse> =>
  api.request(`/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: reassignTo ? { reassignTo } : {},
    parser: DeleteCategoryResponseSchema,
  });

/** Cache invalidation after a category mutation (ui-design 7.5). */
export function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['recurring'] }),
    ]);
}
