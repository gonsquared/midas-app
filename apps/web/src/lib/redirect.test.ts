import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_PATH, safeReturnPath } from './redirect';

describe('safeReturnPath', () => {
  it('accepts known same-origin app paths, with their search', () => {
    expect(safeReturnPath('/transactions')).toBe('/transactions');
    expect(safeReturnPath('/transactions?type=expense&q=rent')).toBe(
      '/transactions?type=expense&q=rent',
    );
    expect(safeReturnPath('/wallets/new')).toBe('/wallets/new');
    expect(safeReturnPath('/settings')).toBe('/settings');
    expect(safeReturnPath('/admin/users')).toBe('/admin/users');
    expect(safeReturnPath('/dashboard?compose=expense')).toBe('/dashboard?compose=expense');
  });

  it('falls back for empty and non-string values', () => {
    for (const value of [undefined, null, '', 42, {}, ['/wallets']]) {
      expect(safeReturnPath(value)).toBe(DEFAULT_RETURN_PATH);
    }
  });

  it('rejects open redirect attempts', () => {
    const attacks = [
      '//evil.example',
      '//evil.example/dashboard',
      '/\x5cevil.example',
      '\x5c\x5cevil.example',
      '\x5c/evil.example',
      '/dashboard\x5c..\x5cevil',
      'https://evil.example',
      'http://localhost/dashboard',
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,hi',
      '/%2f%2fevil.example',
      '/%5cevil.example',
      '%2f%2fevil.example',
      '/dashboard/../../evil',
      '/\t/evil.example',
      '/\n/evil.example',
      ' //evil.example',
      '/dashboard\r\nLocation: https://evil.example',
      'dashboard',
      '/unknown-area',
      '/dashboardx',
      '/login',
      '/register',
      '/@evil.example',
    ];
    for (const attack of attacks) {
      expect(safeReturnPath(attack), attack).toBe(DEFAULT_RETURN_PATH);
    }
  });

  it('drops the fragment and caps the length', () => {
    expect(safeReturnPath('/wallets#token=abc')).toBe('/wallets');
    expect(safeReturnPath(`/wallets?q=${'a'.repeat(3000)}`)).toBe(DEFAULT_RETURN_PATH);
  });
});
