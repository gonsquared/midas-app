import { describe, expect, it, vi } from 'vitest';
import { ExportGate } from './export.js';

describe('ExportGate', () => {
  it('caps concurrent exports and frees a slot exactly once on release', () => {
    const gate = new ExportGate(2);
    const first = gate.acquire('a');
    const second = gate.acquire('b');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(gate.acquire('c')).toBeNull();
    first?.();
    first?.();
    expect(gate.acquire('d')).not.toBeNull();
    expect(gate.acquire('e')).toBeNull();
  });

  it('allows one export per user: a user holding a slot cannot start another, others are not blocked', () => {
    const gate = new ExportGate({ max: 10, perUser: 1 });
    const first = gate.acquire('alice');
    expect(first).not.toBeNull();
    expect(gate.acquire('alice')).toBeNull();
    expect(gate.acquire('bob')).not.toBeNull();
    first?.();
    first?.(); // releasing twice never frees a second slot
    expect(gate.acquire('alice')).not.toBeNull();
    expect(gate.acquire('alice')).toBeNull();
  });

  it('a user exhausting their slots does not consume the shared capacity of others', () => {
    const gate = new ExportGate({ max: 3, perUser: 1 });
    for (let i = 0; i < 20; i++) gate.acquire('greedy');
    expect(gate.acquire('b')).not.toBeNull();
    expect(gate.acquire('c')).not.toBeNull();
    expect(gate.acquire('d')).toBeNull(); // process cap of 3 reached, 'greedy' counted once
  });

  it('calls onExpire after the absolute time cap, and never after release', () => {
    vi.useFakeTimers();
    try {
      const gate = new ExportGate({ max: 2, perUser: 1, maxDurationMs: 1000 });
      const expired = vi.fn();
      const slow = gate.acquire('slow', expired);
      const done = vi.fn();
      const quick = gate.acquire('quick', done);
      quick?.();
      vi.advanceTimersByTime(1001);
      expect(expired).toHaveBeenCalledTimes(1);
      expect(done).not.toHaveBeenCalled();
      slow?.();
    } finally {
      vi.useRealTimers();
    }
  });
});
