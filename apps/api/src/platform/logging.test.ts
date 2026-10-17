import { describe, expect, it } from 'vitest';
import { redactUrl, serializeError } from './logging.js';

describe('serializeError', () => {
  it('keeps only allowlisted fields of a pg error', () => {
    const error = Object.assign(new Error('boom'), {
      code: '23505',
      constraint: 'c',
      table: 't',
      column: 'col',
      routine: 'r',
      detail: 'Key (x)=($argon2id$...)',
      where: 'w',
      internalQuery: 'q',
    });
    const out = serializeError(error);
    expect(out).toEqual({
      type: 'DatabaseError',
      code: '23505',
      constraint: 'c',
      table: 't',
      column: 'col',
      routine: 'r',
      message: 'boom',
      stack: '',
    });
  });

  it('serialises ordinary errors and non-errors', () => {
    expect(serializeError(new TypeError('bad'))).toMatchObject({
      type: 'TypeError',
      message: 'bad',
    });
    expect(serializeError('x')).toEqual({ type: 'NonError', message: 'x', stack: '' });
  });
});

describe('redactUrl', () => {
  it('drops query values and keeps names', () => {
    expect(redactUrl('/api/v1/transactions?q=salary%20acme&limit=20')).toBe(
      '/api/v1/transactions?q=[redacted]&limit=[redacted]',
    );
    expect(redactUrl('/api/v1/x?flag')).toBe('/api/v1/x?flag=[redacted]');
  });
  it('leaves URLs without a query alone', () => {
    expect(redactUrl('/api/v1/wallets')).toBe('/api/v1/wallets');
    expect(redactUrl('/api/v1/wallets?')).toBe('/api/v1/wallets');
  });
});
