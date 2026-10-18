import type { AuditAction, AuditTargetType } from '@midas/shared';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@midas/shared/enums';
import { isValidLocalDate } from '@midas/shared/money';
import { isUuid } from '@/lib/uuid';

export interface AuditSearch {
  actor?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  /** A target id; set by "View audit trail" (the target type is then user). */
  target?: string;
  from?: string;
  to?: string;
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  'auth.registered': 'Account registered',
  'auth.login_succeeded': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.login_blocked_suspended': 'Sign-in blocked (suspended)',
  'auth.logout': 'Signed out',
  'auth.session_reuse_detected': 'Session reuse detected',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_reset_completed': 'Password reset completed',
  'user.password_changed': 'Password changed',
  'admin.user_suspended': 'User suspended',
  'admin.user_reactivated': 'User reactivated',
  'admin.user_role_changed': 'User role changed',
  'admin.category_created': 'Default category created',
  'admin.category_updated': 'Default category updated',
  'admin.category_retired': 'Default category retired',
  'admin.category_restored': 'Default category restored',
  'system.admin_bootstrapped': 'Admin bootstrapped',
};

export function actionLabel(action: string): string {
  return (ACTION_LABELS as Record<string, string>)[action] ?? action;
}

export function parseAuditSearch(raw: Record<string, unknown>): AuditSearch {
  const result: AuditSearch = {};
  if (typeof raw['actor'] === 'string') {
    const actor = raw['actor'].trim().slice(0, 254);
    if (actor) result.actor = actor;
  }
  if ((AUDIT_ACTIONS as readonly string[]).includes(String(raw['action']))) {
    result.action = raw['action'] as AuditAction;
  }
  if ((AUDIT_TARGET_TYPES as readonly string[]).includes(String(raw['targetType']))) {
    result.targetType = raw['targetType'] as AuditTargetType;
  }
  if (isUuid(raw['target'])) result.target = raw['target'];
  const from = typeof raw['from'] === 'string' && isValidLocalDate(raw['from']) ? raw['from'] : '';
  const to = typeof raw['to'] === 'string' && isValidLocalDate(raw['to']) ? raw['to'] : '';
  if (from) result.from = from;
  if (to) result.to = to;
  return result;
}

/** The range ends before it starts; the page shows a message and does not query. */
export function isReversedRange(search: Pick<AuditSearch, 'from' | 'to'>): boolean {
  return Boolean(search.from && search.to && search.to < search.from);
}

/** "2026-10-16 08:30:12" in UTC; audit times must be unambiguous. */
export function utcStamp(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ');
}
