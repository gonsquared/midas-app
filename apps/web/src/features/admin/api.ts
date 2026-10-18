import type {
  AdminUserDetail,
  AdminUserSort,
  AuditAction,
  AuditTargetType,
  Category,
  CreateCategoryRequest,
  PlatformMetrics,
  Role,
  UpdateCategoryRequest,
  UserStatus,
} from '@midas/shared';
import {
  AdminUserDetailSchema,
  AdminUserPageSchema,
  AuditLogPageSchema,
  PlatformMetricsSchema,
} from '@midas/shared/admin';
import { CategoryListResponseSchema, CategorySchema } from '@midas/shared/categories';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const ADMIN_KEY = ['admin'] as const;

export function useAdminMetrics() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'metrics'],
    queryFn: ({ signal }): Promise<PlatformMetrics> =>
      api.request('/admin/metrics', { parser: PlatformMetricsSchema, signal }),
  });
}

export interface AdminUsersQuery {
  q?: string | undefined;
  role?: Role | undefined;
  status?: UserStatus | undefined;
  sort: AdminUserSort;
  page: number;
  pageSize: number;
}

export function useAdminUsers(query: AdminUsersQuery) {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'users', query],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.request('/admin/users', {
        query: {
          ...(query.q ? { q: query.q } : {}),
          ...(query.role ? { role: query.role } : {}),
          ...(query.status ? { status: query.status } : {}),
          sort: query.sort,
          page: query.page,
          pageSize: query.pageSize,
        },
        parser: AdminUserPageSchema,
        signal,
      }),
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    enabled: Boolean(id),
    queryKey: [...ADMIN_KEY, 'user', id],
    queryFn: ({ signal }) =>
      api.request(`/admin/users/${encodeURIComponent(id ?? '')}`, {
        parser: AdminUserDetailSchema,
        signal,
      }),
  });
}

const userPath = (id: string) => `/admin/users/${encodeURIComponent(id)}`;

export const suspendUser = (id: string, reason?: string): Promise<AdminUserDetail> =>
  api.request(`${userPath(id)}/suspend`, {
    method: 'POST',
    body: reason ? { reason } : {},
    parser: AdminUserDetailSchema,
  });

export const reactivateUser = (id: string): Promise<AdminUserDetail> =>
  api.request(`${userPath(id)}/reactivate`, { method: 'POST', parser: AdminUserDetailSchema });

export const changeUserRole = (id: string, role: Role): Promise<AdminUserDetail> =>
  api.request(`${userPath(id)}/role`, {
    method: 'PATCH',
    body: { role },
    parser: AdminUserDetailSchema,
  });

export function useAdminCategories(includeRetired: boolean) {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'categories', { includeRetired }],
    queryFn: ({ signal }): Promise<Category[]> =>
      api
        .request('/admin/categories', {
          query: { includeRetired },
          parser: CategoryListResponseSchema,
          signal,
        })
        .then((response) => response.items),
  });
}

const categoryPath = (id: string) => `/admin/categories/${encodeURIComponent(id)}`;

export const createSystemCategory = (input: CreateCategoryRequest): Promise<Category> =>
  api.request('/admin/categories', { method: 'POST', body: input, parser: CategorySchema });

export const updateSystemCategory = (id: string, input: UpdateCategoryRequest): Promise<Category> =>
  api.request(categoryPath(id), { method: 'PATCH', body: input, parser: CategorySchema });

export const retireSystemCategory = (id: string): Promise<Category> =>
  api.request(`${categoryPath(id)}/retire`, { method: 'POST', parser: CategorySchema });

export const restoreSystemCategory = (id: string): Promise<Category> =>
  api.request(`${categoryPath(id)}/restore`, { method: 'POST', parser: CategorySchema });

export interface AuditFilters {
  actorEmail?: string | undefined;
  action?: AuditAction | undefined;
  targetType?: AuditTargetType | undefined;
  targetId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function useAuditLogs(filters: AuditFilters, enabled = true) {
  return useInfiniteQuery({
    enabled,
    queryKey: [...ADMIN_KEY, 'audit', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.request('/admin/audit-logs', {
        query: {
          ...(filters.actorEmail ? { actorEmail: filters.actorEmail } : {}),
          ...(filters.action ? { action: [filters.action] } : {}),
          ...(filters.targetType ? { targetType: filters.targetType } : {}),
          ...(filters.targetId ? { targetId: filters.targetId } : {}),
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
          limit: 50,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        parser: AuditLogPageSchema,
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
}
