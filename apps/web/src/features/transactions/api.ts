import type {
  CreateTransactionRequest,
  CreateTransferRequest,
  Transaction,
  TransactionPage,
  Transfer,
  UpdateTransactionRequest,
  UpdateTransferRequest,
} from '@midas/shared';
import { TransactionPageSchema, TransactionSchema } from '@midas/shared/transactions';
import { TransferSchema } from '@midas/shared/transfers';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { toApiQuery, type TransactionFilters } from './filters';

export const TRANSACTIONS_KEY = ['transactions'] as const;

export function fetchTransactionPage(
  filters: TransactionFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
): Promise<TransactionPage> {
  return api.request('/transactions', {
    query: { ...toApiQuery(filters), ...(cursor ? { cursor } : {}) },
    parser: TransactionPageSchema,
    ...(signal ? { signal } : {}),
  });
}

/** Cursor-paged ledger. Changing filters or sort changes the key, which restarts from page one. */
export function useTransactionList(filters: TransactionFilters, enabled = true) {
  return useInfiniteQuery({
    enabled,
    queryKey: [...TRANSACTIONS_KEY, 'list', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchTransactionPage(filters, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** The latest 100 entries: recent categories and the default wallet for quick-add (DN-13). */
export function useRecentTransactions() {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'recent'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      api
        .request('/transactions', {
          query: { limit: 100, sort: 'date_desc' },
          parser: TransactionPageSchema,
          signal,
        })
        .then((page) => page.items),
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'one', id],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api.request(`/transactions/${encodeURIComponent(id ?? '')}`, {
        parser: TransactionSchema,
        signal,
      }),
  });
}

export function useTransfer(id: string | undefined) {
  return useQuery({
    queryKey: ['transfers', id],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api.request(`/transfers/${encodeURIComponent(id ?? '')}`, { parser: TransferSchema, signal }),
  });
}

export const createTransaction = (input: CreateTransactionRequest): Promise<Transaction> =>
  api.request('/transactions', { method: 'POST', body: input, parser: TransactionSchema });

export const updateTransaction = (
  id: string,
  input: UpdateTransactionRequest,
): Promise<Transaction> =>
  api.request(`/transactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    parser: TransactionSchema,
  });

export const deleteTransaction = (id: string): Promise<void> =>
  api.request(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const createTransfer = (input: CreateTransferRequest): Promise<Transfer> =>
  api.request('/transfers', { method: 'POST', body: input, parser: TransferSchema });

export const updateTransfer = (id: string, input: UpdateTransferRequest): Promise<Transfer> =>
  api.request(`/transfers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    parser: TransferSchema,
  });

export const deleteTransfer = (id: string): Promise<void> =>
  api.request(`/transfers/${encodeURIComponent(id)}`, { method: 'DELETE' });

/**
 * After a transaction or transfer changes: ledger, balances, reports and budgets (ui-design 7.5).
 * Resolves once the wallets (balances) are fresh because the confirmation text quotes them; the
 * rest refetch in the background. Loaded ledger pages are trimmed to the first page first, so a
 * long "Load more" session is not refetched page by page.
 */
export function useInvalidateLedger() {
  const queryClient = useQueryClient();
  return async (): Promise<void> => {
    queryClient.setQueriesData<InfiniteData<TransactionPage, string | undefined>>(
      { queryKey: [...TRANSACTIONS_KEY, 'list'] },
      (data) =>
        data && data.pages.length > 1
          ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
          : data,
    );
    void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    void queryClient.invalidateQueries({ queryKey: ['budgets'] });
    await queryClient.invalidateQueries({ queryKey: ['wallets'] });
  };
}
