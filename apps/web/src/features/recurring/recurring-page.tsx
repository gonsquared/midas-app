import type { RecurringStatus, RecurringTemplate } from '@midas/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { useReturnFocus } from '@/lib/use-return-focus';
import {
  deleteTemplate,
  pauseTemplate,
  resumeTemplate,
  useInvalidateRecurring,
  useRecurringTemplates,
} from './api';
import { RecurringFormDialog } from './recurring-form-dialog';
import { RecurringTable, type TemplateActions } from './recurring-table';
import { failureSentence } from './schedule';
import { parseRecurringSearch } from './search';
import { RunsDrawer } from './runs-drawer';

type Filter = 'all' | RecurringStatus;
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' },
] as const;

type Dialog =
  | { kind: 'form'; mode: 'create' }
  | { kind: 'form'; mode: 'edit'; template: RecurringTemplate }
  | { kind: 'runs'; template: RecurringTemplate }
  | { kind: 'delete'; template: RecurringTemplate }
  | null;

/** Templates the system paused (wallet archived, category retired, repeated failures). */
function NeedsAttention({
  templates,
  actions,
}: {
  templates: readonly RecurringTemplate[];
  actions: TemplateActions;
}) {
  const flagged = templates.filter((t) => t.status === 'paused' && t.lastError);
  if (flagged.length === 0) return null;
  return (
    <section
      aria-labelledby="recurring-attention"
      className="mb-6 rounded-md border-l-4 border-warning bg-warning-tint p-3"
    >
      <h2 id="recurring-attention" className="text-body-sm font-semibold">
        Needs attention ({flagged.length})
      </h2>
      <ul className="m-0 list-none p-0">
        {flagged.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span className="flex items-start gap-2 text-body-sm">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 text-warning" />
              <span dir="auto">
                {t.name}: paused. {failureSentence(t.lastError)}
              </span>
            </span>
            <span className="flex gap-2">
              {t.lastError === 'CATEGORY_RETIRED' ? (
                <Button variant="secondary" size="sm" onClick={() => actions.onEdit(t)}>
                  Choose category
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                loading={actions.busy?.has(t.id) ?? false}
                onClick={() => actions.onResume(t)}
              >
                Resume
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecurringPage() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => parseRecurringSearch(raw), [JSON.stringify(raw)]);
  const filter: Filter = search.status ?? 'all';
  const navigate = useNavigate();
  const announce = useAnnounce();
  const { toast } = useToast();
  const invalidate = useInvalidateRecurring();
  const { capture, restore } = useReturnFocus();
  const { data, isPending, isError, error, refetch } = useRecurringTemplates();
  const [dialog, setDialog] = useState<Dialog>(null);
  const inFlight = useRef(new Set<string>());

  const all = useMemo(() => data ?? [], [data]);
  const visible = all.filter((t) => filter === 'all' || t.status === filter);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const open = (next: Dialog, opener?: HTMLElement | null) => {
    capture(opener);
    setDialog(next);
  };

  async function setPaused(t: RecurringTemplate, pause: boolean) {
    if (busy.has(t.id) || inFlight.current.has(t.id)) return;
    inFlight.current.add(t.id);
    setBusy((current) => new Set(current).add(t.id));
    try {
      await (pause ? pauseTemplate(t.id) : resumeTemplate(t.id));
      await invalidate({ ledger: !pause });
      const message = pause
        ? "Paused. Nothing is added while paused, and missed dates aren't added later."
        : `${t.name} resumed.`;
      announce(message);
      toast({
        variant: 'success',
        title: pause ? `${t.name} paused.` : message,
        ...(pause ? { description: message } : {}),
      });
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : '';
      if (code === 'WALLET_ARCHIVED') {
        toast({
          variant: 'danger',
          title: `Unarchive ${t.wallet.name} first`,
          description: 'This recurring transaction uses an archived wallet.',
          action: {
            label: 'Open wallets',
            onSelect: () => void navigate({ to: '/wallets', search: { archived: 1 } }),
          },
        });
      } else if (code === 'CATEGORY_RETIRED') {
        toast({
          variant: 'danger',
          title: 'Choose a new category',
          description: 'The category was retired.',
          action: {
            label: 'Edit',
            onSelect: () =>
              open(
                { kind: 'form', mode: 'edit', template: t },
                document.querySelector<HTMLElement>(
                  `[data-recurring-row="${CSS.escape(t.id)}"] [data-row-actions]`,
                ),
              ),
          },
        });
      } else {
        toast({ variant: 'danger', title: "Couldn't update that. Try again in a moment." });
      }
    } finally {
      inFlight.current.delete(t.id);
      setBusy((current) => {
        const next = new Set(current);
        next.delete(t.id);
        return next;
      });
    }
  }

  const actions: TemplateActions = {
    onEdit: (template) => open({ kind: 'form', mode: 'edit', template }),
    onPause: (template) => void setPaused(template, true),
    onResume: (template) => void setPaused(template, false),
    onDelete: (template) => open({ kind: 'delete', template }),
    onHistory: (template) => open({ kind: 'runs', template }),
    busy,
  };
  const createButton = (
    <Button onClick={() => open({ kind: 'form', mode: 'create' })}>
      <Plus aria-hidden="true" className="size-4" />
      Create recurring
    </Button>
  );

  let body: ReactNode;
  if (isPending) {
    body = <Skeleton className="h-48" aria-busy="true" />;
  } else if (isError) {
    body = (
      <ApiErrorAlert
        error={error}
        message="Couldn't load your recurring transactions. Check your connection and try again."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (all.length === 0) {
    body = (
      <EmptyState title="Automate what repeats." action={createButton}>
        Rent, salary and subscriptions can be added for you on schedule.
      </EmptyState>
    );
  } else if (visible.length === 0) {
    body = <p className="text-body text-ink-2">Nothing here. Try another status.</p>;
  } else {
    body = <RecurringTable templates={visible} actions={actions} />;
  }

  const close = () => setDialog(null);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 [&>div:first-child]:mb-0">
        <PageHeader title="Recurring" />
        {all.length > 0 ? createButton : null}
      </div>
      {all.length > 0 ? (
        <>
          <Segmented
            legend="Show"
            options={FILTERS}
            value={filter}
            className="mb-4"
            onChange={(next) =>
              void navigate({
                to: '/recurring',
                search: next === 'all' ? {} : { status: next },
                replace: true,
              })
            }
          />
          <NeedsAttention templates={all} actions={actions} />
        </>
      ) : null}
      {body}
      {dialog?.kind === 'form' ? (
        <RecurringFormDialog
          mode={dialog.mode}
          {...(dialog.mode === 'edit' ? { template: dialog.template } : {})}
          onClose={close}
          onCloseAutoFocus={restore}
          onGone={() => {
            close();
            toast({ variant: 'danger', title: 'That recurring transaction no longer exists.' });
            void invalidate();
          }}
          onSaved={(saved) => {
            close();
            announce(
              dialog.mode === 'create' ? 'Recurring transaction created.' : 'Changes saved.',
            );
            toast({ variant: 'success', title: `${saved.name} saved.` });
          }}
        />
      ) : null}
      {dialog?.kind === 'runs' ? (
        <RunsDrawer template={dialog.template} onClose={close} onCloseAutoFocus={restore} />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && close()}
          onCloseAutoFocus={restore}
          title="Delete this recurring transaction?"
          consequences={['Transactions it already added stay in your ledger.']}
          confirmLabel="Delete recurring"
          onConfirm={async () => {
            try {
              await deleteTemplate(dialog.template.id);
            } catch (caught) {
              if (!(caught instanceof ApiError && caught.status === 404)) throw caught;
            }
            await invalidate();
            close();
            announce('Recurring transaction deleted.');
            toast({ variant: 'success', title: 'Recurring transaction deleted.' });
          }}
        />
      ) : null}
    </div>
  );
}
