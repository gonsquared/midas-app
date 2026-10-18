import { useSearch } from '@tanstack/react-router';
import { isUuid } from '@/lib/uuid';
import { ComposerCreate } from './composer-create';
import { TransactionDetail } from './transaction-detail';

/**
 * Mounted once in the app shell: ?compose=expense|income|transfer opens the Add drawer and
 * ?tx=<id> opens one transaction, on any page (ui-design 18.3.2).
 */
export function ComposerHost() {
  const search = useSearch({ strict: false }) as { compose?: unknown; tx?: unknown };
  if (
    search.compose === 'expense' ||
    search.compose === 'income' ||
    search.compose === 'transfer'
  ) {
    return <ComposerCreate type={search.compose} />;
  }
  if (isUuid(search.tx)) {
    return <TransactionDetail key={search.tx} id={search.tx} />;
  }
  return null;
}
