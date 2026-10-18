import type { Category, CategoryType } from '@midas/shared';
import { Plus } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { usePreferences } from '@/lib/preferences';
import { useReturnFocus } from '@/lib/use-return-focus';
import { AdminHeader, PrivacyLine } from './admin-ui';
import { AdminCategoriesTable } from './admin-categories-table';
import { AdminCategoryForm } from './admin-category-form';
import {
  restoreSystemCategory,
  retireSystemCategory,
  useAdminCategories,
  useInvalidateAdmin,
} from './api';

const TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;

type Dialog =
  | { kind: 'form'; mode: 'create' }
  | { kind: 'form'; mode: 'edit'; category: Category }
  | { kind: 'retire'; category: Category }
  | null;

export function AdminCategoriesPage() {
  const { locale } = usePreferences();
  const announce = useAnnounce();
  const { toast } = useToast();
  const invalidate = useInvalidateAdmin();
  const { capture, restore } = useReturnFocus();
  const [type, setType] = useState<CategoryType>('expense');
  const [showRetired, setShowRetired] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const query = useAdminCategories(true);
  const rows = (query.data ?? []).filter((c) => c.type === type && (showRetired || !c.retired));
  const open = (next: Dialog) => {
    capture();
    setDialog(next);
  };

  async function restoreOne(category: Category) {
    if (inFlight.current.has(category.id)) return;
    inFlight.current.add(category.id);
    setRestoring((current) => new Set(current).add(category.id));
    setRestoreError(null);
    try {
      await restoreSystemCategory(category.id);
      await invalidate();
      announce(`${category.name} restored.`);
      toast({ variant: 'success', title: `${category.name} restored.` });
    } catch (caught) {
      setRestoreError(
        caught instanceof ApiError && caught.code === 'CATEGORY_NAME_TAKEN'
          ? 'An active default category already has this name. Rename one of them first.'
          : "Couldn't restore that category. Try again in a moment.",
      );
    } finally {
      inFlight.current.delete(category.id);
      setRestoring((current) => {
        const next = new Set(current);
        next.delete(category.id);
        return next;
      });
    }
  }

  let body: ReactNode;
  if (query.isPending) body = <Skeleton className="h-48" aria-busy="true" />;
  else if (query.isError) {
    body = (
      <ApiErrorAlert
        error={query.error}
        message="Couldn't load default categories."
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (rows.length === 0) {
    body = <p className="py-6 text-body text-ink-2">No {type} categories to show.</p>;
  } else {
    body = (
      <AdminCategoriesTable
        rows={rows}
        type={type}
        locale={locale}
        actions={{
          onEdit: (category) => open({ kind: 'form', mode: 'edit', category }),
          onRetire: (category) => open({ kind: 'retire', category }),
          onRestore: (category) => void restoreOne(category),
          restoring,
        }}
      />
    );
  }

  return (
    <div>
      <AdminHeader title="Default categories">
        <Button onClick={() => open({ kind: 'form', mode: 'create' })}>
          <Plus aria-hidden="true" className="size-4" />
          Create category
        </Button>
      </AdminHeader>
      <PrivacyLine />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Segmented legend="Category type" options={TYPES} value={type} onChange={setType} />
        <Switch label="Show retired" checked={showRetired} onCheckedChange={setShowRetired} />
      </div>
      {restoreError ? (
        <Alert variant="danger" className="mb-4">
          {restoreError}
        </Alert>
      ) : null}
      {body}
      {dialog?.kind === 'form' ? (
        <AdminCategoryForm
          mode={dialog.mode}
          {...(dialog.mode === 'edit' ? { category: dialog.category } : {})}
          presetType={type}
          onClose={() => setDialog(null)}
          onCloseAutoFocus={restore}
          onSaved={(saved) => {
            setDialog(null);
            announce(`${saved.name} saved.`);
            toast({ variant: 'success', title: `${saved.name} saved.` });
          }}
        />
      ) : null}
      {dialog?.kind === 'retire' ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onCloseAutoFocus={restore}
          title={`Retire ${dialog.category.name}?`}
          consequences={[
            'Existing transactions, budgets and recurring items keep it.',
            "People can't choose it for new ones.",
            'You can restore it later.',
          ]}
          confirmLabel="Retire category"
          onConfirm={async () => {
            await retireSystemCategory(dialog.category.id);
            await invalidate();
            announce(`${dialog.category.name} retired.`);
            toast({ variant: 'success', title: `${dialog.category.name} retired.` });
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
