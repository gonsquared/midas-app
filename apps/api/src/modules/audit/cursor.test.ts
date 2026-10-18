import { describe, expect, it } from 'vitest';
import { decodeAuditCursor, encodeAuditCursor } from './cursor.js';

const key = { occurredAt: '2026-10-18T10:00:00.000Z', id: '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e' };
const invalid = expect.objectContaining({ code: 'INVALID_CURSOR', status: 400 });

describe('audit cursor', () => {
  it('round-trips for the same filters regardless of action order', () => {
    const cursor = encodeAuditCursor({ action: ['b.x', 'a.y'], targetType: 'user' }, key);
    expect(decodeAuditCursor(cursor, { action: ['a.y', 'b.x'], targetType: 'user' })).toEqual(key);
  });

  it('rejects a cursor from other filters', () => {
    const cursor = encodeAuditCursor({ targetType: 'user' }, key);
    expect(() => decodeAuditCursor(cursor, { targetType: 'category' })).toThrow(invalid);
  });

  it.each(['', '!!!', 'e30', Buffer.from('{"v":2}').toString('base64url'), 'a'.repeat(600)])(
    'rejects the malformed cursor %j',
    (cursor) => {
      expect(() => decodeAuditCursor(cursor, {})).toThrow(invalid);
    },
  );

  it('rejects a payload with an injected value in the sort key', () => {
    const payload = {
      v: 1,
      f: 'x'.repeat(22),
      k: ["2026-10-18'; drop table audit_logs;--", key.id],
    };
    const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(() => decodeAuditCursor(cursor, {})).toThrow(invalid);
  });
});
