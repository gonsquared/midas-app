import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useInvalidateLedger } from './api';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useInvalidateLedger', () => {
  it('trims loaded ledger pages to the first page before invalidating', async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useInvalidateLedger(), { wrapper });
    const key = ['transactions', 'list', { sort: 'date_desc' }];
    queryClient.setQueryData(key, {
      pages: [{ items: [1] }, { items: [2] }, { items: [3] }],
      pageParams: [undefined, 'a', 'b'],
    });
    await act(() => result.current());
    const data = queryClient.getQueryData<{ pages: unknown[]; pageParams: unknown[] }>(key);
    expect(data?.pages).toEqual([{ items: [1] }]);
    expect(data?.pageParams).toEqual([undefined]);
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('waits only for wallets, not for the slow ledger refetch', async () => {
    const { wrapper } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let ledgerCalls = 0;
    let walletCalls = 0;
    const { result } = renderHook(
      () => {
        useQuery({
          queryKey: ['transactions', 'recent'],
          queryFn: async () => {
            ledgerCalls += 1;
            if (ledgerCalls > 1) await gate;
            return [];
          },
        });
        useQuery({
          queryKey: ['wallets'],
          queryFn: async () => ++walletCalls,
        });
        return useInvalidateLedger();
      },
      { wrapper },
    );
    await waitFor(() => expect(walletCalls).toBe(1));
    await waitFor(() => expect(ledgerCalls).toBe(1));
    await act(() => result.current());
    expect(walletCalls).toBe(2);
    expect(ledgerCalls).toBe(2); // refetch started, still pending behind the gate
    release();
  });
});
