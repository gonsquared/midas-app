import { describe, expect, it } from 'vitest';
import { actionLabel, isReversedRange, parseAuditSearch, utcStamp } from './audit-search';

describe('parseAuditSearch', () => {
  it('keeps valid filters only', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(
      parseAuditSearch({
        actor: ' kim@example.com ',
        action: 'admin.user_suspended',
        targetType: 'user',
        target: id,
        from: '2026-10-01',
        to: '2026-10-16',
      }),
    ).toEqual({
      actor: 'kim@example.com',
      action: 'admin.user_suspended',
      targetType: 'user',
      target: id,
      from: '2026-10-01',
      to: '2026-10-16',
    });
    expect(parseAuditSearch({ action: 'drop.table', target: 'x', from: '2026-13-01' })).toEqual({});
  });

  it('keeps a reversed date range so the page can explain it', () => {
    const search = parseAuditSearch({ from: '2026-10-16', to: '2026-10-01' });
    expect(search).toEqual({ from: '2026-10-16', to: '2026-10-01' });
    expect(isReversedRange(search)).toBe(true);
    expect(isReversedRange({ from: '2026-10-01', to: '2026-10-01' })).toBe(false);
    expect(isReversedRange({ from: '2026-10-01' })).toBe(false);
  });
});

describe('labels', () => {
  it('translates known actions and shows unknown ones as given', () => {
    expect(actionLabel('admin.user_suspended')).toBe('User suspended');
    expect(actionLabel('future.thing')).toBe('future.thing');
    expect(utcStamp('2026-10-16T08:30:12.000Z')).toBe('2026-10-16 08:30:12');
  });
});
