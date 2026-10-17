import { describe, expect, it } from 'vitest';
import {
  CreateTransactionRequestSchema,
  ListTransactionsQuerySchema,
  UpdateTransactionRequestSchema,
} from './transactions.js';

const ID_A = '0197f8a0-0000-7000-8000-000000000001';
const ID_B = '0197f8a0-0000-7000-8000-000000000002';

describe('ListTransactionsQuerySchema', () => {
  it('applies defaults', () => {
    expect(ListTransactionsQuerySchema.parse({})).toEqual({ sort: 'date_desc', limit: 25 });
  });

  it('turns single and repeated keys into arrays', () => {
    const parsed = ListTransactionsQuerySchema.parse({
      walletId: ID_A,
      categoryId: [ID_A, ID_B],
      type: 'expense',
      limit: '100',
      minAmountMinor: '5',
    });
    expect(parsed.walletId).toEqual([ID_A]);
    expect(parsed.categoryId).toEqual([ID_A, ID_B]);
    expect(parsed.type).toEqual(['expense']);
    expect(parsed.limit).toBe(100);
    expect(parsed.minAmountMinor).toBe(5);
  });

  it.each([
    ['limit 0', { limit: '0' }],
    ['limit 101', { limit: '101' }],
    ['limit fractional', { limit: '1.5' }],
    ['inverted dates', { from: '2026-02-01', to: '2026-01-01' }],
    ['inverted amounts', { minAmountMinor: '10', maxAmountMinor: '5' }],
    ['non-uuid wallet', { walletId: 'nope' }],
    ['unknown type', { type: 'refund' }],
    ['unknown sort', { sort: 'name_asc' }],
    ['empty q', { q: '' }],
    ['long q', { q: 'x'.repeat(101) }],
    ['amount exponent', { minAmountMinor: '1e3' }],
    ['amount negative', { minAmountMinor: '-5' }],
    ['unknown param', { userId: ID_A }],
    ['too many wallets', { walletId: Array.from({ length: 51 }, () => ID_A) }],
  ])('rejects %s', (_name, query) => {
    expect(ListTransactionsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('transaction write schemas', () => {
  const valid = {
    type: 'expense',
    walletId: ID_A,
    categoryId: ID_B,
    amountMinor: 1250,
    occurredOn: '2026-10-17',
  };

  it('accepts a minimal create body', () => {
    expect(CreateTransactionRequestSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['transfer type', { type: 'transfer' }],
    ['userId', { userId: ID_A }],
    ['currency', { currency: 'EUR' }],
    ['float amount', { amountMinor: 1.5 }],
    ['zero amount', { amountMinor: 0 }],
    ['bad date', { occurredOn: '2026-02-30' }],
  ])('create rejects %s', (_name, patch) => {
    expect(CreateTransactionRequestSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it('update accepts null to clear the note and rejects unknown fields', () => {
    expect(UpdateTransactionRequestSchema.parse({ note: null })).toEqual({ note: null });
    expect(UpdateTransactionRequestSchema.safeParse({ transferId: ID_A }).success).toBe(false);
  });
});
