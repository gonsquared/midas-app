import { describe, expect, it } from 'vitest';
import { safeMetadata } from './audit-metadata';

describe('safeMetadata', () => {
  it('shows allowlisted keys for a known action and hides the rest', () => {
    const result = safeMetadata('admin.user_role_changed', {
      from: 'user',
      to: 'admin',
      emailHmac: 'abc',
      note: '<img src=x onerror=alert(1)>',
    });
    expect(result.rows).toEqual([
      { key: 'from', label: 'From', value: 'user' },
      { key: 'to', label: 'To', value: 'admin' },
    ]);
    expect(result.hidden).toBe(2);
  });

  it('hides everything for actions without an allowlist', () => {
    const result = safeMetadata('auth.login_failed', { emailHmac: 'deadbeef' });
    expect(result).toEqual({ rows: [], hidden: 1 });
  });

  it('formats booleans and string lists, and rejects odd shapes and long values', () => {
    expect(
      safeMetadata('admin.user_suspended', { sessionsRevoked: 3, hasReason: true }).rows,
    ).toEqual([
      { key: 'sessionsRevoked', label: 'Sessions revoked', value: '3' },
      { key: 'hasReason', label: 'Reason given', value: 'Yes' },
    ]);
    expect(
      safeMetadata('admin.category_updated', { fields: ['name', 'color'] }).rows[0]?.value,
    ).toBe('name, color');
    expect(safeMetadata('admin.category_updated', { fields: { a: 1 } }).hidden).toBe(1);
    expect(safeMetadata('admin.category_created', { type: 'x'.repeat(200) }).hidden).toBe(1);
  });

  it('ignores prototype-named actions', () => {
    expect(safeMetadata('__proto__', { a: 1 })).toEqual({ rows: [], hidden: 1 });
  });
});
