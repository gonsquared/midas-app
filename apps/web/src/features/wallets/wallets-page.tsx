import type { Wallet } from '@midas/shared';
import { Link, useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { useContainerWidth } from '@/lib/use-container-width';
import { unarchiveWallet, useInvalidateWallets, useWallets } from './api';
import { WalletRows, WalletTotals } from './wallet-list';
import { ArchiveWalletDialog, DeleteWalletDialog } from './wallet-dialogs';
import { WalletFormDialog } from './wallet-form-dialog';
import type { WalletActions } from './wallet-row-menu';
import type { WalletsSearch } from './search';

const TABLE_MIN_WIDTH = 640;
const NEW_PATH = /^\/wallets\/new\/?$/;
const EDIT_PATH = /^\/wallets\/([^/]+)\/edit\/?$/;

function WalletsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-20" />
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  );
}

export function WalletsPage() {
  const search = useSearch({ strict: false }) as WalletsSearch;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const announce = useAnnounce();
  const { toast } = useToast();
  const invalidate = useInvalidateWallets();
  const { data, isPending, isError, error, refetch } = useWallets();
  const [containerRef, width] = useContainerWidth<HTMLDivElement>();
  const [archiveTarget, setArchiveTarget] = useState<Wallet | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Wallet | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const showArchived = search.archived === 1;
  const wallets = useMemo(() => data ?? [], [data]);
  const active = useMemo(() => wallets.filter((wallet) => !wallet.archived), [wallets]);
  const archived = useMemo(() => wallets.filter((wallet) => wallet.archived), [wallets]);
  const layout = width !== 0 && width < TABLE_MIN_WIDTH ? 'list' : 'table';

  const editId = EDIT_PATH.exec(pathname)?.[1];
  const creating = NEW_PATH.test(pathname);
  const editing = editId ? wallets.find((wallet) => wallet.id === editId) : undefined;

  const goToList = () =>
    void navigate({ to: '/wallets', search: showArchived ? { archived: 1 } : {}, replace: true });

  // A direct link to an unknown or foreign wallet shows a status and returns to the list.
  useEffect(() => {
    if (editId && data && !editing) {
      setNotice("That wallet doesn't exist.");
      goToList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, data, editing]);

  // A "doesn't exist" notice describes the last bad link; drop it once a dialog opens.
  useEffect(() => {
    if (creating || editing) setNotice('');
  }, [creating, editing]);

  useEffect(() => {
    if (!highlightId) return undefined;
    document.querySelector<HTMLElement>(`[data-wallet-link="${highlightId}"]`)?.focus();
    const timer = window.setTimeout(() => setHighlightId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  // After a row leaves the list, focus moves to the next row, the previous row, then the heading.
  const [focusRequest, setFocusRequest] = useState<{ id: string | null } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const target = focusRequest.id
      ? document.querySelector<HTMLElement>(`[data-wallet-link="${focusRequest.id}"]`)
      : null;
    (target ?? document.querySelector<HTMLElement>('main h1'))?.focus();
    setFocusRequest(null);
  }, [focusRequest, wallets]);

  const neighbourOf = (wallet: Wallet): string | null => {
    const ordered = [...active, ...(showArchived ? archived : [])];
    const index = ordered.findIndex((candidate) => candidate.id === wallet.id);
    return ordered[index + 1]?.id ?? ordered[index - 1]?.id ?? null;
  };

  async function unarchive(wallet: Wallet, withToast = true) {
    try {
      await unarchiveWallet(wallet.id);
      await invalidate();
      if (withToast) {
        toast({
          variant: 'success',
          title: `${wallet.name} unarchived.`,
          description: 'Its recurring transactions stay paused.',
          action: { label: 'View recurring', onSelect: () => void navigate({ to: '/recurring' }) },
        });
      }
    } catch (caught) {
      const taken = caught instanceof ApiError && caught.code === 'WALLET_NAME_TAKEN';
      toast({
        variant: 'danger',
        title: "Couldn't unarchive " + wallet.name,
        description: taken
          ? 'Another active wallet has this name. Rename or archive that wallet first, then unarchive this one.'
          : 'Try again in a moment.',
      });
    }
  }

  const actions: WalletActions = {
    onArchive: setArchiveTarget,
    onDelete: setDeleteTarget,
    onUnarchive: (wallet) => void unarchive(wallet),
  };

  const afterRemoval = (wallet: Wallet) => setFocusRequest({ id: neighbourOf(wallet) });

  const setArchivedVisible = (next: boolean) => {
    void navigate({ to: '/wallets', search: next ? { archived: 1 } : {}, replace: true });
    announce(next ? `Showing archived wallets, ${archived.length}.` : 'Hiding archived wallets.');
  };

  const createButton = (
    <Button asChild>
      <Link to="/wallets/new" search={showArchived ? { archived: 1 } : {}}>
        <Plus aria-hidden="true" className="size-4" />
        Create wallet
      </Link>
    </Button>
  );

  let body: ReactNode;
  if (isPending) {
    body = <WalletsSkeleton />;
  } else if (isError) {
    body = (
      <ApiErrorAlert
        error={error}
        message="Couldn't load your wallets. Check your connection and try again."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (wallets.length === 0) {
    body = (
      <EmptyState title="Wallets are where your money lives." action={createButton}>
        You have not added one yet. Create a wallet to start tracking.
      </EmptyState>
    );
  } else {
    body = (
      <>
        {active.length > 0 ? (
          <>
            <WalletTotals wallets={wallets} />
            <WalletRows
              wallets={active}
              actions={actions}
              highlightId={highlightId}
              layout={layout}
              caption="Wallets"
            />
          </>
        ) : (
          <EmptyState title="All your wallets are archived." action={createButton}>
            Show archived wallets to unarchive one, or create a new wallet.
          </EmptyState>
        )}
        {showArchived && archived.length > 0 ? (
          <section id="archived-wallets" aria-labelledby="archived-heading" className="mt-8">
            <h2 id="archived-heading" className="mb-2 font-display text-heading">
              Archived ({archived.length})
            </h2>
            <WalletRows
              wallets={archived}
              actions={actions}
              highlightId={highlightId}
              layout={layout}
              caption="Archived wallets"
            />
          </section>
        ) : null}
      </>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Wallets" />
        <div className="flex flex-wrap items-center gap-4">
          {archived.length > 0 || showArchived ? (
            <Switch
              label={`Show archived (${archived.length})`}
              checked={showArchived}
              onCheckedChange={setArchivedVisible}
              {...(showArchived ? { 'aria-controls': 'archived-wallets' } : {})}
            />
          ) : null}
          {wallets.length > 0 ? createButton : null}
        </div>
      </div>
      {notice ? (
        <Alert variant="info" className="mb-4">
          {notice}
        </Alert>
      ) : null}
      <div ref={containerRef}>{body}</div>
      {creating ? (
        <WalletFormDialog
          mode="create"
          onClose={goToList}
          onGone={goToList}
          onSaved={(wallet) => {
            goToList();
            setHighlightId(wallet.id);
            announce('Wallet created.');
          }}
        />
      ) : null}
      {editing ? (
        <WalletFormDialog
          mode="edit"
          wallet={editing}
          onClose={goToList}
          onGone={() => {
            goToList();
            toast({ variant: 'danger', title: 'That wallet no longer exists.' });
            void invalidate();
          }}
          onSaved={(wallet) => {
            goToList();
            setHighlightId(wallet.id);
            announce(wallet.name + ' updated.');
          }}
        />
      ) : null}
      {archiveTarget ? (
        <ArchiveWalletDialog
          wallet={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onDone={(wallet) => {
            setArchiveTarget(null);
            afterRemoval(wallet);
            toast({
              variant: 'success',
              title: wallet.name + ' archived.',
              description: "Undo won't restart paused recurring transactions.",
              duration: 10000,
              action: { label: 'Undo', onSelect: () => void unarchive(wallet, false) },
            });
          }}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteWalletDialog
          wallet={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onSwitchToArchive={(wallet) => {
            setDeleteTarget(null);
            setArchiveTarget(wallet);
          }}
          onDone={(wallet) => {
            setDeleteTarget(null);
            afterRemoval(wallet);
            announce('Wallet deleted.');
            toast({ variant: 'success', title: 'Wallet deleted.' });
          }}
        />
      ) : null}
    </div>
  );
}
