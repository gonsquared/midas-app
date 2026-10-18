import type { AdminUserSort, Role, UserStatus } from '@midas/shared';
import { ADMIN_USER_SORTS, ROLES, USER_STATUSES } from '@midas/shared/enums';
import { isUuid } from '@/lib/uuid';

export interface UsersSearch {
  q?: string;
  role?: Role;
  status?: UserStatus;
  sort?: AdminUserSort;
  page?: number;
  pageSize?: number;
  /** The user whose detail drawer is open. */
  user?: string;
}

export const DEFAULT_SORT: AdminUserSort = 'createdAt_desc';
export const PAGE_SIZES = [25, 50, 100] as const;

function intIn(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value);
  if (!/^\d{1,7}$/.test(text)) return undefined;
  const n = Number(text);
  return n >= min && n <= max ? n : undefined;
}

export function parseUsersSearch(raw: Record<string, unknown>): UsersSearch {
  const result: UsersSearch = {};
  if (typeof raw['q'] === 'string') {
    const q = raw['q'].trim().slice(0, 100);
    if (q) result.q = q;
  }
  if ((ROLES as readonly string[]).includes(String(raw['role']))) result.role = raw['role'] as Role;
  if ((USER_STATUSES as readonly string[]).includes(String(raw['status']))) {
    result.status = raw['status'] as UserStatus;
  }
  const sort = raw['sort'];
  if (sort !== DEFAULT_SORT && (ADMIN_USER_SORTS as readonly string[]).includes(String(sort))) {
    result.sort = sort as AdminUserSort;
  }
  const page = intIn(raw['page'], 2, 1000);
  if (page) result.page = page;
  const pageSize = intIn(raw['pageSize'], 1, 100);
  if (pageSize && pageSize !== 25 && (PAGE_SIZES as readonly number[]).includes(pageSize)) {
    result.pageSize = pageSize;
  }
  if (isUuid(raw['user'])) result.user = raw['user'];
  return result;
}
