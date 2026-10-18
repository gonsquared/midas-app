import { minorToDecimal } from '@midas/shared';
import type { TransactionRow } from './repository.js';

/** UTF-8 byte order mark so spreadsheet software detects the encoding (api-contract 8). */
export const CSV_BOM = '﻿';

export const CSV_COLUMNS = [
  'date',
  'type',
  'direction',
  'wallet',
  'currency',
  'amount',
  'category',
  'note',
  'counterpart_wallet',
  'transaction_id',
  'transfer_id',
  'recurring_template_id',
] as const;

/**
 * Formula-injection guard (OWASP CSV injection, api-contract 8): a text cell that spreadsheet
 * software could read as a formula gets a leading apostrophe. It applies to user-controlled text
 * only (wallet, category and note). Numbers such as the signed amount are produced by the server
 * and must stay numeric, and ids and dates are never user text.
 *
 * Leading characters that spreadsheet software may read as a formula or command: ASCII = + - @,
 * a pipe (DDE-style payloads), control whitespace, the fullwidth forms some locales normalize
 * (U+FF1D, U+FF0B, U+FF0D, U+FF20) and the Unicode minus sign (U+2212).
 */
const FORMULA_START = /^[=+\-@|\t\r\n＝＋－＠−]/;

export function protectFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** RFC 4180 quoting: wrap in double quotes and double any quote when the cell needs it. */
export function quoteCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A user-text cell: formula protection first, then quoting. */
export function textCell(value: string | null | undefined): string {
  return quoteCell(protectFormula(value ?? ''));
}

export function csvLine(cells: readonly string[]): string {
  return `${cells.join(',')}\r\n`;
}

export function csvHeader(): string {
  return csvLine(CSV_COLUMNS);
}

/** One export row. Income and transfer-in amounts are positive, expense and transfer-out negative. */
export function transactionCsvLine(row: TransactionRow): string {
  const isTransfer = row.type === 'transfer';
  const negative = row.type === 'expense' || row.transferDirection === 'out';
  return csvLine([
    row.occurredOn,
    row.type,
    isTransfer ? (row.transferDirection ?? '') : '',
    textCell(row.walletName),
    row.currency,
    minorToDecimal(negative ? -row.amountMinor : row.amountMinor, row.currency),
    isTransfer ? '' : textCell(row.categoryName),
    textCell(row.note),
    isTransfer ? textCell(row.counterpartWalletName) : '',
    row.id,
    row.transferId ?? '',
    row.recurringTemplateId ?? '',
  ]);
}
