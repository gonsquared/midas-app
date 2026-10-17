import { useCategories } from '@/features/categories/api';
import { useWallets } from '@/features/wallets/api';
import { useRecentTransactions } from './api';

/** Everything the composer pickers need; categories include retired ones so old data resolves. */
export function useComposerData() {
  const wallets = useWallets();
  const categories = useCategories({ includeRetired: true });
  const recent = useRecentTransactions();
  return {
    wallets: wallets.data ?? [],
    categories: categories.data ?? [],
    recent: recent.data,
    isPending: wallets.isPending || categories.isPending,
    isError: wallets.isError || categories.isError,
    error: wallets.error ?? categories.error,
    retry: () => {
      void wallets.refetch();
      void categories.refetch();
    },
  };
}
