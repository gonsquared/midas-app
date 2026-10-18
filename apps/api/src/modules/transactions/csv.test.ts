import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  csvHeader,
  protectFormula,
  quoteCell,
  textCell,
  transactionCsvLine,
} from './csv.js';
import type { TransactionRow } from './repository.js';

function row(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'tx-1',
    type: 'expense',
    walletId: 'w-1',
    walletName: 'Checking',
    walletCurrency: 'USD',
    walletArchivedAt: null,
    categoryId: 'c-1',
    categoryName: 'Groceries',
    categoryType: 'expense',
    categoryIcon: 'tag',
    categoryColor: 'blue',
    categoryOwnerId: null,
    categoryRetiredAt: null,
    amountMinor: 1250,
    currency: 'USD',
    occurredOn: '2026-10-01',
    note: null,
    transferId: null,
    transferDirection: null,
    recurringTemplateId: null,
    counterpartId: null,
    counterpartAmountMinor: null,
    counterpartWalletId: null,
    counterpartWalletName: null,
    counterpartWalletCurrency: null,
    counterpartWalletArchivedAt: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('formula injection protection (E5-F3-S1)', () => {
  it.each([
    '=1+1',
    '+SUM(A1)',
    '-2+3',
    '@cmd',
    '\tTab',
    '\rReturn',
    '\nLine',
    '|cmd',
    '＝1+1',
    '＋SUM(A1)',
    '－2',
    '＠cmd',
    '−2',
  ])('prefixes a text cell starting with %j', (value) => {
    expect(protectFormula(value)).toBe(`'${value}`);
  });

  it.each(['plain', 'a=b', 'x+y', '1=1 later', '', ' =spaced', 'a|b'])(
    'leaves %j untouched',
    (value) => {
      expect(protectFormula(value)).toBe(value);
    },
  );

  it('quotes after protecting, so a dangerous cell with a comma stays one cell', () => {
    expect(textCell('=HYPERLINK("http://x","y"),z')).toBe(`"'=HYPERLINK(""http://x"",""y""),z"`);
  });
});

describe('CSV quoting (RFC 4180)', () => {
  it('quotes commas, quotes and line breaks only', () => {
    expect(quoteCell('simple')).toBe('simple');
    expect(quoteCell('a,b')).toBe('"a,b"');
    expect(quoteCell('say "hi"')).toBe('"say ""hi"""');
    expect(quoteCell('line1\nline2')).toBe('"line1\nline2"');
    expect(quoteCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('transactionCsvLine', () => {
  it('has the contract columns and a UTF-8 BOM constant', () => {
    expect(csvHeader()).toBe(
      'date,type,direction,wallet,currency,amount,category,note,counterpart_wallet,transaction_id,transfer_id,recurring_template_id\r\n',
    );
    expect(CSV_BOM).toBe('﻿');
  });

  it('writes expenses as negative and income as positive decimals', () => {
    expect(transactionCsvLine(row())).toBe(
      '2026-10-01,expense,,Checking,USD,-12.50,Groceries,,,tx-1,,\r\n',
    );
    const income = row({ type: 'income', categoryName: 'Salary', amountMinor: 300000 });
    expect(transactionCsvLine(income)).toBe(
      '2026-10-01,income,,Checking,USD,3000.00,Salary,,,tx-1,,\r\n',
    );
  });

  it('keeps the signed amount numeric (never prefixed) and uses the currency exponent', () => {
    const yen = row({ currency: 'JPY', walletCurrency: 'JPY', amountMinor: 5000 });
    expect(transactionCsvLine(yen)).toContain(',JPY,-5000,');
  });

  it('protects wallet, category and note cells', () => {
    const line = transactionCsvLine(
      row({ walletName: '=cmd', categoryName: '@evil', note: '-1+1, "x"' }),
    );
    expect(line).toContain(",'=cmd,");
    expect(line).toContain(",'@evil,");
    expect(line).toContain(`,"'-1+1, ""x""",`);
  });

  it('writes both directions of a transfer with the counterpart wallet and no category', () => {
    const out = row({
      type: 'transfer',
      categoryId: null,
      categoryName: null,
      transferId: 'tr-1',
      transferDirection: 'out',
      counterpartWalletName: 'Savings',
    });
    expect(transactionCsvLine(out)).toBe(
      '2026-10-01,transfer,out,Checking,USD,-12.50,,,Savings,tx-1,tr-1,\r\n',
    );
    const incoming = row({
      type: 'transfer',
      categoryName: null,
      transferId: 'tr-1',
      transferDirection: 'in',
      counterpartWalletName: 'Checking',
      walletName: 'Savings',
    });
    expect(transactionCsvLine(incoming)).toBe(
      '2026-10-01,transfer,in,Savings,USD,12.50,,,Checking,tx-1,tr-1,\r\n',
    );
  });

  it('writes the recurring template id for generated transactions', () => {
    expect(transactionCsvLine(row({ recurringTemplateId: 'rt-1' }))).toMatch(/,rt-1\r\n$/);
  });
});
