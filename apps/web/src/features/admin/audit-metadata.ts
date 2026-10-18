/**
 * Defence in depth for audit metadata (ADR-018): the API already strips secrets, but the UI
 * only renders keys known to be safe for each action and hides the rest (for example the email
 * HMAC pseudonym on failed sign-ins). Values are shown as short plain text, never as markup.
 */
const SAFE_KEYS: Record<string, readonly string[]> = {
  'admin.user_suspended': ['sessionsRevoked', 'hasReason'],
  'admin.user_reactivated': ['sessionsRevoked', 'hasReason'],
  'admin.user_role_changed': ['from', 'to'],
  'admin.category_created': ['type'],
  'admin.category_updated': ['fields'],
  'system.admin_bootstrapped': ['from', 'to', 'via'],
};

const LABELS: Record<string, string> = {
  sessionsRevoked: 'Sessions revoked',
  hasReason: 'Reason given',
  from: 'From',
  to: 'To',
  type: 'Type',
  fields: 'Fields changed',
  via: 'Via',
};

const VALUE_MAX = 80;

export interface SafeMetadata {
  rows: Array<{ key: string; label: string; value: string }>;
  /** Some keys were not on the allowlist, or had an unexpected shape, and were left out. */
  hidden: number;
}

function safeValue(value: unknown): string | null {
  if (typeof value === 'string') return value.length <= VALUE_MAX ? value : null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value) && value.length <= 10) {
    const parts = value.map((item) => (typeof item === 'string' ? safeValue(item) : null));
    return parts.every((part) => part !== null) ? parts.join(', ') : null;
  }
  return null;
}

export function safeMetadata(action: string, metadata: Record<string, unknown>): SafeMetadata {
  const allowed = Object.hasOwn(SAFE_KEYS, action) ? (SAFE_KEYS[action] ?? []) : [];
  const rows: SafeMetadata['rows'] = [];
  let hidden = 0;
  for (const key of Object.keys(metadata)) {
    const value = allowed.includes(key) ? safeValue(metadata[key]) : null;
    if (value === null) hidden += 1;
    else rows.push({ key, label: LABELS[key] ?? key, value });
  }
  return { rows, hidden };
}
