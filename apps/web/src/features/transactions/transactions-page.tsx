import type { Transaction } from '@midas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBreakpoint } from '@/app/shell/use-breakpoint';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useCategories } from '@/features/categories/api';
import { useWallets } from '@/features/wallets/api';
import { ApiError } from '@/lib/api-client';
import { formatDayHeading, todayLocalDate } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { useTransactionList, useRecentTransactions } from './api';
import { ActiveFilters } from './active-filters';
import { ExportButton } from './export-button';
import { useOverlays } from './composer-store';
import { DeleteTransactionDialog } from './delete-transaction-dialog';
import { FilterBar } from './filter-bar';
import type { FilterPatch } from './filter-panels';
import {
  DEFAULT_SORT,
  countActiveFilters,
  filtersToSearch,
  groupByDay,
  hasIgnoredFilters,
  parseTransactionsSearch,
  matchesFilters,
  scopeAmountFilter,
  toFilters,
  type TransactionFilters,
  type TransactionsSearch,
} from './filters';
import { QuickAddBar } from './quick-add-bar';
import { TransactionRow, TransactionRowsSkeleton, type RowActions } from './transaction-row';

const NO_FILTERS: TransactionFilters = { wallet: [], category: [], type: [], sort: DEFAULT_SORT };

export function TransactionsPage() {
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const rawSearch = useRouterState({
    select: (s) => s.location.search as unknown as Record<string, unknown>,
  });
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const { locale, timezone } = usePreferences();
  const { openCompose, openTransaction } = useOverlays();
  const wallets = useWallets();
  const categories = useCategories({ includeRetired: true });
  const recent = useRecentTransactions();
  // The router merges raw URL values into the search, so validate again before trusting them.
  const search: TransactionsSearch = useMemo(
    () => parseTransactionsSearch(routeSearch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(routeSearch)],
  );
  const searchKey = JSON.stringify(search, (k, v) =>
    k === 'compose' || k === 'tx' ? undefined : v,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const urlFilters = useMemo(() => toFilters(search), [searchKey]);
  // The amount range is meaningless across currencies: drop it (and say so) once wallets are known.
  const walletList = useMemo(() => wallets.data ?? [], [wallets.data]);
  const { filters, amountIgnored } = useMemo(
    () => scopeAmountFilter(urlFilters, walletList),
    [urlFilters, walletList],
  );
  const amountPending =
    wallets.isPending && (urlFilters.min !== undefined || urlFilters.max !== undefined);
  const list = useTransactionList(filters, !amountPending);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hiddenNotice, setHiddenNotice] = useState(false);
  const loadedBefore = useRef<number | null>(null);

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const hasNext = Boolean(list.hasNextPage);
  const today = todayLocalDate(timezone);
  const active = countActiveFilters(filters) + (filters.q ? 1 : 0);
  const categoryList = categories.data ?? [];
  const dateSorted = filters.sort === 'date_desc' || filters.sort === 'date_asc';
  const filtersIgnored = hasIgnoredFilters(rawSearch);

  const replaceFilters = (next: TransactionFilters) => {
    setHiddenNotice(false);
    void navigate({
      to: '/transactions',
      replace: true,
      search: {
        ...(search.compose ? { compose: search.compose } : {}),
        ...(search.tx ? { tx: search.tx } : {}),
        ...filtersToSearch(next),
      },
    });
  };
  // Built from the latest URL, not this render's filters, so a debounced search commit can never
  // overwrite a filter the user changed while the timer was running.
  const applyPatch = (patch: FilterPatch) => {
    setHiddenNotice(false);
    void navigate({
      to: '/transactions',
      replace: true,
      search: ((prev: Record<string, unknown>) => {
        const latest = parseTransactionsSearch(prev);
        return {
          ...(latest.compose ? { compose: latest.compose } : {}),
          ...(latest.tx ? { tx: latest.tx } : {}),
          ...filtersToSearch({ ...toFilters(latest), ...patch }),
        };
      }) as never,
    });
  };
  const clearFilters = () => replaceFilters({ ...NO_FILTERS, sort: filters.sort });

  // A stale cursor means the list changed underneath us: start over quietly.
  useEffect(() => {
    if (list.error instanceof ApiError && list.error.code === 'INVALID_CURSOR') {
      void queryClient.resetQueries({ queryKey: ['transactions', 'list'] });
      announce('The list was refreshed.');
    }
  }, [list.error, queryClient, announce]);

  // After "Load more", focus the first newly added row so reading continues downward.
  useEffect(() => {
    if (loadedBefore.current === null || list.isFetchingNextPage) return;
    const before = loadedBefore.current;
    loadedBefore.current = null;
    // A failed fetch adds nothing: stay put and let the footer alert speak.
    if (items.length <= before) return;
    const added = items[before];
    if (added) document.querySelector<HTMLElement>(`[data-tx-link="${added.id}"]`)?.focus();
    announce(`${items.length - before} more transactions loaded. ${items.length} shown.`);
  }, [items, list.isFetchingNextPage, announce]);

  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = window.setTimeout(() => setHighlightId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const status = list.isPending
    ? 'Loading transactions.'
    : items.length === 0
      ? 'No transactions match these filters.'
      : `${items.length} transaction${items.length === 1 ? '' : 's'}${hasNext ? ' shown, more available.' : '.'}`;

  const actions: RowActions = {
    onEdit: (t) => openTransaction(t.id),
    onDuplicate: (t) => {
      const out = t.transfer?.direction === 'out';
      const prefill =
        t.type === 'transfer'
          ? {
              fromWalletId: out ? t.wallet.id : t.transfer?.counterpartWallet.id,
              toWalletId: out ? t.transfer?.counterpartWallet.id : t.wallet.id,
              amountMinor: t.amountMinor,
              note: t.note,
            }
          : {
              ...(t.wallet.archived ? {} : { walletId: t.wallet.id }),
              categoryId: t.category?.id,
              amountMinor: t.amountMinor,
              note: t.note,
            };
      openCompose(t.type, prefill);
    },
    onDelete: setDeleteTarget,
  };

  const loadingLookups = wallets.isPending || categories.isPending;
  const noWallets = !wallets.isPending && walletList.filter((w) => !w.archived).length === 0;
  const busy = list.isFetching && !list.isFetchingNextPage && !list.isPending;

  let results;
  if (list.isPending) {
    results = <TransactionRowsSkeleton />;
  } else if (list.isError && items.length === 0) {
    results = (
      <ApiErrorAlert
        error={list.error}
        message="Couldn't load transactions. Check your connection and try again."
        action={
          <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (items.length === 0 && noWallets && active === 0) {
    results = (
      <EmptyState
        title="Create a wallet before adding transactions."
        action={
          <Button onClick={() => void navigate({ to: '/wallets/new' })}>Create wallet</Button>
        }
      >
        Every transaction belongs to a wallet.
      </EmptyState>
    );
  } else if (items.length === 0 && active === 0) {
    results = (
      <EmptyState
        title="Your ledger is empty."
        action={
          <Button onClick={() => openCompose('expense')}>
            <Plus aria-hidden="true" className="size-4" />
            Add transaction
          </Button>
        }
      >
        Add income or expenses to see them here.
      </EmptyState>
    );
  } else if (items.length === 0) {
    results = (
      <EmptyState
        title="No transactions match these filters."
        action={<Button onClick={clearFilters}>Clear filters</Button>}
      >
        {filters.q && active === 1
          ? `No notes contain "${filters.q}".`
          : filters.from || filters.to
            ? 'Try a wider date range.'
            : 'Try removing a filter.'}
      </EmptyState>
    );
  } else {
    const row = (t: Transaction) => (
      <TransactionRow
        key={t.id}
        transaction={t}
        query={filters.q}
        showDate={!dateSorted}
        highlighted={t.id === highlightId}
        actions={actions}
      />
    );
    results = (
      <div className="@container">
        {dateSorted ? (
          groupByDay(items).map((group) => (
            <section key={group.date} aria-labelledby={`day-${group.date}`}>
              <h3
                id={`day-${group.date}`}
                className="sticky top-14 z-10 bg-canvas py-1 text-body-sm font-semibold text-ink-2"
              >
                {formatDayHeading(group.date, locale, today)}
              </h3>
              <ul className="m-0 list-none p-0">{group.items.map(row)}</ul>
            </section>
          ))
        ) : (
          <ul className="m-0 list-none p-0">{items.map(row)}</ul>
        )}
        <div className="flex flex-col items-center gap-2 py-6">
          {list.isFetchNextPageError ? (
            <Alert
              variant="danger"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    loadedBefore.current = items.length;
                    void list.fetchNextPage();
                  }}
                >
                  Try again
                </Button>
              }
            >
              Couldn&apos;t load more. Your list is unchanged.
            </Alert>
          ) : hasNext ? (
            <Button
              variant="secondary"
              loading={list.isFetchingNextPage}
              className="w-full sm:w-auto"
              onClick={() => {
                loadedBefore.current = items.length;
                void list.fetchNextPage();
              }}
            >
              Load more
            </Button>
          ) : (
            <p className="text-body-sm text-ink-3">
              {filters.sort === 'date_asc'
                ? "You've reached the newest transaction."
                : "You've reached the oldest transaction."}
            </p>
          )}
          <p className="text-caption text-ink-3">Showing {items.length}</p>
          <p className="text-caption text-ink-3">
            Transfers aren&apos;t counted as income or expenses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4 [&>div:first-child]:mb-0">
        <PageHeader title="Transactions" />
        <ExportButton filters={filters} />
      </div>
      {breakpoint === 'desktop' ? (
        <QuickAddBar
          wallets={walletList}
          categories={categoryList}
          recent={recent.data}
          loading={loadingLookups}
          onAdded={(saved) => {
            if ('category' in saved) {
              setHighlightId(saved.id);
              if (active > 0 && !matchesFilters(saved, filters)) {
                setHiddenNotice(true);
                announce('Added. It does not match the current filters.');
              }
            }
          }}
        />
      ) : null}
      <div className="mb-4 flex flex-col gap-3">
        <FilterBar
          filters={filters}
          wallets={walletList}
          categories={categoryList}
          onChange={applyPatch}
          onReplace={replaceFilters}
          isMobile={breakpoint === 'mobile'}
        />
        <ActiveFilters
          filters={filters}
          wallets={walletList}
          categories={categoryList}
          onChange={applyPatch}
          onClearAll={clearFilters}
          onRemoved={(name) => announce(`Filter removed: ${name}.`)}
        />
        {filtersIgnored ? (
          <Alert variant="info">
            Some filters in the link weren&apos;t valid and were ignored.
          </Alert>
        ) : null}
        {amountIgnored ? (
          <Alert variant="info">
            The amount filter was ignored because the wallets in scope use different currencies.
            Choose wallets in one currency to use it.
          </Alert>
        ) : null}
        {hiddenNotice ? (
          <Alert
            variant="info"
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          >
            Added, but it doesn&apos;t match the current filters.
          </Alert>
        ) : null}
      </div>
      <p aria-live="polite" className="mb-2 text-body-sm text-ink-2">
        {status}
      </p>
      <section
        aria-labelledby="tx-results-heading"
        aria-busy={busy || undefined}
        className={busy ? 'opacity-60' : undefined}
      >
        <h2 id="tx-results-heading" className="sr-only">
          Results
        </h2>
        {busy ? (
          <p className="mb-1 flex items-center gap-2 text-caption text-ink-3">
            <Spinner /> Updating...
          </p>
        ) : null}
        {results}
      </section>
      {deleteTarget ? (
        <DeleteTransactionDialog
          transaction={deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onDeleted={(message) => {
            setDeleteTarget(null);
            announce(message);
            document.querySelector<HTMLElement>('main h1')?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
