import type { AdminUserDetail } from '@midas/shared';
import { registerAdmin, registerUser, type IntegrationContext, type TestUser } from './api.js';

/** Shared helpers for the admin API tests. */
export function adminHelpers(getContext: () => IntegrationContext) {
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
    url: string,
    user: TestUser | null,
    payload?: unknown,
  ) =>
    getContext().app.inject({
      method,
      url,
      ...(user && { headers: user.headers }),
      ...(payload !== undefined && { payload: payload as object }),
    });
  const code = (res: { json: () => unknown }) => (res.json() as { code: string }).code;
  const admin = (overrides: Record<string, unknown> = {}) =>
    registerAdmin(getContext().app, getContext().owner, overrides);
  const user = (overrides: Record<string, unknown> = {}) =>
    registerUser(getContext().app, overrides);
  const detail = async (actor: TestUser, id: string) =>
    (await call('GET', `/api/v1/admin/users/${id}`, actor)).json<AdminUserDetail>();
  return { call, code, admin, user, detail };
}
