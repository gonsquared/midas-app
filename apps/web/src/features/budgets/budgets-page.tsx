import type { Budget } from '@midas/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { todayLocalDate } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { useReturnFocus } from '@/lib/use-return-focus';
import { deleteBudget, useBudgets, useInvalidateBudgets } from './api';
import { BudgetFormDialog } from './budget-form-dialog';
import { BudgetRow, type BudgetActions } from './budget-row';
import {
  PERIOD_FILTERS,
  PERIOD_FILTER_LABELS,
  attentionAnnouncement,
  budgetName,
  groupBudgets,
  isCurrentPeriod,
  navigatorLabel,
  shiftBudgetDate,
  type PeriodFilter,
} from './budget-state';
import { parseBudgetsSearch, type BudgetsSearch } from './search';

const FILTER_OPTIONS = PERIOD_FILTERS.map((value) => ({
  value,
  label: PERIOD_FILTER_LABELS[value],
}));

function BudgetsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-20" />
      ))}
    </div>
  );
}

type Editing = { mode: 'create' } | { mode: 'edit'; budget: Budget } | null;

export function BudgetsPage() {
  const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => parseBudgetsSearch(rawSearch), [JSON.stringify(rawSearch)]);
  const filter: PeriodFilter = search.period ?? 'all';
  const { locale, timezone } = usePreferences();
  const today = todayLocalDate(timezone);
  const date = search.date ?? today;
  const navigate = useNavigate();
  const announce = useAnnounce();
  const { toast } = useToast();
  const invalidate = useInvalidateBudgets();
  const { capture, restore } = useReturnFocus();
  const { data, isPending, isError, error, refetch } = useBudgets(date);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const visible = useMemo(
    () => (data?.items ?? []).filter((b) => filter === 'all' || b.period === filter),
    [data, filter],
  );
  const groups = useMemo(() => groupBudgets(visible), [visible]);

  // One polite summary per distinct state of the loaded data (ui-design 6.9).
  const announced = useRef('');
  useEffect(() => {
    if (!data) return;
    const message = attentionAnnouncement(visible);
    if (message && message !== announced.current) announce(message);
    announced.current = message;
  }, [data, visible, announce]);

  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = window.setTimeout(() => setHighlightId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const go = (next: BudgetsSearch) =>
    void navigate({ to: '/budgets', search: next, replace: true });
  const withDate = (nextDate: string, nextFilter: PeriodFilter): BudgetsSearch => ({
    ...(nextFilter !== 'all' ? { period: nextFilter } : {}),
    ...(isCurrentPeriod(nextDate, nextFilter, today) ? {} : { date: nextDate }),
  });
  const step = (direction: -1 | 1) => {
    const next = shiftBudgetDate(date, filter, direction);
    go(withDate(next, filter));
    announce(navigatorLabel(next, filter, locale));
  };
  const current = isCurrentPeriod(date, filter, today);

  const actions: BudgetActions = {
    onEdit: (budget) => {
      capture();
      setEditing({ mode: 'edit', budget });
    },
    onDelete: (budget) => {
      capture();
      setDeleteTarget(budget);
    },
  };
  const openCreate = () => {
    capture();
    setEditing({ mode: 'create' });
  };
  const createButton = (
    <Button onClick={openCreate}>
      <Plus aria-hidden="true" className="size-4" />
      Create budget
    </Button>
  );

  const section = (title: string, budgets: Budget[], id: string) =>
    budgets.length > 0 ? (
      <section aria-labelledby={id} className="mb-6">
        <h2 id={id} className="mb-1 font-display text-heading">
          {title} ({budgets.length})
        </h2>
        <ul className="m-0 list-none p-0">
          {budgets.map((budget) => (
            <BudgetRow
              key={budget.id}
              budget={budget}
              today={today}
              actions={actions}
              highlighted={budget.id === highlightId}
            />
          ))}
        </ul>
      </section>
    ) : null;

  let body: ReactNode;
  if (isPending) {
    body = <BudgetsSkeleton />;
  } else if (isError) {
    body = (
      <ApiErrorAlert
        error={error}
        message="Couldn't load your budgets. Check your connection and try again."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if ((data?.items.length ?? 0) === 0) {
    body = (
      <EmptyState title="Budgets help you spend with a plan." action={createButton}>
        Set a limit for everything or for one category, and Midas warns you before you overspend.
      </EmptyState>
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        title={`No ${PERIOD_FILTER_LABELS[filter].toLowerCase()} budgets.`}
        action={createButton}
      >
        Show all budgets, or create one for this period.
      </EmptyState>
    );
  } else {
    body = (
      <>
        {section('Needs attention', groups.attention, 'budgets-attention')}
        {section('On track', groups.onTrack, 'budgets-on-track')}
      </>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 [&>div:first-child]:mb-0">
        <PageHeader title="Budgets" />
        {(data?.items.length ?? 0) > 0 ? createButton : null}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-1" role="group" aria-label="Budget period">
          <IconButton
            label="Previous period"
            icon={<ChevronLeft className="size-4" />}
            onClick={() => step(-1)}
          />
          <span
            data-testid="budget-period-label"
            className="min-w-36 text-center font-display text-subheading font-semibold"
          >
            {navigatorLabel(date, filter, locale)}
          </span>
          <IconButton
            label="Next period"
            icon={<ChevronRight className="size-4" />}
            onClick={() => step(1)}
          />
          {current ? null : (
            <Button variant="secondary" size="sm" onClick={() => go(withDate(today, filter))}>
              Today
            </Button>
          )}
        </div>
        <Segmented
          legend="Show budgets"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(next) => go(withDate(date, next))}
        />
      </div>
      <div aria-busy={isPending || undefined}>{body}</div>
      {editing ? (
        <BudgetFormDialog
          mode={editing.mode}
          {...(editing.mode === 'edit' ? { budget: editing.budget } : {})}
          existing={data?.items ?? []}
          onClose={() => setEditing(null)}
          onCloseAutoFocus={restore}
          onGone={() => {
            setEditing(null);
            toast({ variant: 'danger', title: 'That budget no longer exists.' });
            void invalidate();
          }}
          onSaved={(saved) => {
            setEditing(null);
            setHighlightId(saved.id);
            announce(editing.mode === 'create' ? 'Budget created.' : 'Budget updated.');
          }}
        />
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onCloseAutoFocus={restore}
          title={`Delete ${budgetName(deleteTarget)} budget?`}
          consequences={["Your transactions aren't affected."]}
          confirmLabel="Delete budget"
          onConfirm={async () => {
            try {
              await deleteBudget(deleteTarget.id);
            } catch (caught) {
              if (!(caught instanceof ApiError && caught.status === 404)) throw caught;
            }
            await invalidate();
            setDeleteTarget(null);
            announce('Budget deleted.');
            toast({ variant: 'success', title: 'Budget deleted.' });
          }}
        />
      ) : null}
    </div>
  );
}
