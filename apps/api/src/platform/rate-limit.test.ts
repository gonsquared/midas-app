import { describe, expect, it } from 'vitest';
import { hashKey, ipKey } from './rate-limit.js';

describe('ipKey', () => {
  it('keeps IPv4 addresses as they are', () => {
    expect(ipKey('203.0.113.9')).toBe('203.0.113.9');
  });

  it('maps every address of one IPv6 /64 to the same key', () => {
    const a = ipKey('2001:db8:1:2::1');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(ipKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe(a);
    expect(ipKey('2001:DB8:1:2:dead:beef:0:1')).toBe(a);
    expect(ipKey('2001:db8:1:2:0:0:0:0')).toBe(a);
  });

  it('separates different /64 networks', () => {
    expect(ipKey('2001:db8:1:2::1')).not.toBe(ipKey('2001:db8:1:3::1'));
    expect(ipKey('2001:db8:1:2::1')).not.toBe(ipKey('2001:db8:2:2::1'));
  });

  it('handles compressed forms, loopback and zone ids', () => {
    expect(ipKey('::1')).toBe('0:0:0:0::/64');
    expect(ipKey('::')).toBe('0:0:0:0::/64');
    expect(ipKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(ipKey('2001:db8::1:0:0:1')).toBe('2001:db8:0:0::/64');
  });

  it('treats IPv4-mapped IPv6 addresses as the IPv4 address', () => {
    expect(ipKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(ipKey('::ffff:cb00:7109')).toBe('203.0.113.9');
  });

  it('passes through values that are not IP addresses', () => {
    expect(ipKey('unknown')).toBe('unknown');
    expect(ipKey('')).toBe('');
  });
});

describe('hashKey', () => {
  it('is stable and does not contain the input', () => {
    expect(hashKey('a@example.com')).toBe(hashKey('a@example.com'));
    expect(hashKey('a@example.com')).not.toContain('example');
  });
});
