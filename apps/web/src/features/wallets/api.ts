import type { CreateWalletRequest, UpdateWalletRequest, Wallet } from '@midas/shared';
import { WalletListResponseSchema, WalletSchema } from '@midas/shared/wallets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const WALLETS_KEY = ['wallets'] as const;

/** One request returns active and archived wallets (at most 100); the client splits them. */
export async function fetchWallets(signal?: AbortSignal): Promise<Wallet[]> {
  const response = await api.request('/wallets', {
    query: { includeArchived: true },
    parser: WalletListResponseSchema,
    ...(signal ? { signal } : {}),
  });
  return response.items;
}

export function useWallets() {
  return useQuery({ queryKey: WALLETS_KEY, queryFn: ({ signal }) => fetchWallets(signal) });
}

export const createWallet = (input: CreateWalletRequest): Promise<Wallet> =>
  api.request('/wallets', { method: 'POST', body: input, parser: WalletSchema });

export const updateWallet = (id: string, input: UpdateWalletRequest): Promise<Wallet> =>
  api.request(`/wallets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    parser: WalletSchema,
  });

export const archiveWallet = (id: string): Promise<Wallet> =>
  api.request(`/wallets/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    parser: WalletSchema,
  });

export const unarchiveWallet = (id: string): Promise<Wallet> =>
  api.request(`/wallets/${encodeURIComponent(id)}/unarchive`, {
    method: 'POST',
    parser: WalletSchema,
  });

export const deleteWallet = (id: string): Promise<void> =>
  api.request(`/wallets/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Cache invalidation after a wallet mutation (ui-design 7.5). */
export function useInvalidateWallets() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: WALLETS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['recurring'] }),
    ]);
}
