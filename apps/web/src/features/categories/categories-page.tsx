import type { Category, CategoryType } from '@midas/shared';
import { Link, useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useBreakpoint } from '@/app/shell/use-breakpoint';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useCategories, useInvalidateCategories } from './api';
import { CategoryDetailDialog } from './category-detail-dialog';
import { CategoryFormDialog } from './category-form-dialog';
import { TypeSections } from './category-list';
import { DeleteCategoryDialog, describeDeletion } from './delete-category-dialog';
import { parseCategoriesSearch, type CategoriesSearch } from './search';

const NEW_PATH = /^\/categories\/new\/?$/;
const EDIT_PATH = /^\/categories\/([^/]+)\/edit\/?$/;

function CategoriesSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6 lg:grid-cols-2">
      {[0, 1].map((column) => (
        <div key={column} className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <Skeleton key={row} className="h-12" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CategoriesPage() {
  // The router merges raw URL values into the search, so validate again before trusting them.
  const search: CategoriesSearch = parseCategoriesSearch(
    useSearch({ strict: false }) as Record<string, unknown>,
  );
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const announce = useAnnounce();
  const { toast } = useToast();
  const invalidate = useInvalidateCategories();
  const { data, isPending, isError, error, refetch } = useCategories();
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const categories = useMemo(() => data ?? [], [data]);
  const byType = (type: CategoryType) => categories.filter((category) => category.type === type);
  const expense = byType('expense');
  const income = byType('income');
  const tab: CategoryType = search.type ?? 'expense';

  const editId = EDIT_PATH.exec(pathname)?.[1];
  const creating = NEW_PATH.test(pathname);
  const editing = editId ? categories.find((category) => category.id === editId) : undefined;

  const toList = () =>
    void navigate({
      to: '/categories',
      search: search.type ? { type: search.type } : {},
      replace: true,
    });
  const toCreate = (type?: CategoryType) =>
    void navigate({ to: '/categories/new', search: type ? { type } : {} });

  useEffect(() => {
    if (editId && data && !editing) {
      setNotice("That category doesn't exist.");
      toList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, data, editing]);

  // A "doesn't exist" notice describes the last bad link; drop it once a dialog opens.
  useEffect(() => {
    if (creating || editing) setNotice('');
  }, [creating, editing]);

  useEffect(() => {
    if (!highlightId) return undefined;
    document.querySelector<HTMLElement>(`[data-category-link="${highlightId}"]`)?.focus();
    const timer = window.setTimeout(() => setHighlightId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const sections = (
    type: CategoryType,
    list: readonly Category[],
    headingLevel: 'h2' | 'h3' = 'h3',
  ) => (
    <TypeSections
      headingLevel={headingLevel}
      categories={list}
      highlightId={highlightId}
      onDelete={setDeleteTarget}
      onCreate={() => toCreate(type)}
    />
  );

  let body;
  if (isPending) body = <CategoriesSkeleton />;
  else if (isError) {
    body = (
      <ApiErrorAlert
        error={error}
        message="Couldn't load your categories. Check your connection and try again."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (breakpoint === 'desktop') {
    body = (
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="expense-heading">
          <h2 id="expense-heading" className="mb-3 font-display text-heading">
            Expense ({expense.length})
          </h2>
          {sections('expense', expense)}
        </section>
        <section aria-labelledby="income-heading">
          <h2 id="income-heading" className="mb-3 font-display text-heading">
            Income ({income.length})
          </h2>
          {sections('income', income)}
        </section>
      </div>
    );
  } else {
    body = (
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            to: '/categories',
            search: { type: value === 'income' ? 'income' : 'expense' },
            replace: true,
          })
        }
      >
        <TabsList aria-label="Category type">
          <TabsTrigger value="expense" aria-label={`Expense, ${expense.length}`}>
            Expense <span aria-hidden="true">{expense.length}</span>
          </TabsTrigger>
          <TabsTrigger value="income" aria-label={`Income, ${income.length}`}>
            Income <span aria-hidden="true">{income.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="expense" className="pt-4">
          {sections('expense', expense, 'h2')}
        </TabsContent>
        <TabsContent value="income" className="pt-4">
          {sections('income', income, 'h2')}
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Categories" />
        <Button asChild>
          <Link
            to="/categories/new"
            search={breakpoint === 'desktop' || !search.type ? {} : { type: search.type }}
          >
            <Plus aria-hidden="true" className="size-4" />
            Create category
          </Link>
        </Button>
      </div>
      {notice ? (
        <Alert variant="info" className="mb-4">
          {notice}
        </Alert>
      ) : null}
      {body}
      {creating ? (
        <CategoryFormDialog
          mode="create"
          categories={categories}
          {...(search.type ? { presetType: search.type } : {})}
          onClose={toList}
          onGone={toList}
          onReadOnly={toList}
          onSaved={(category) => {
            toList();
            setHighlightId(category.id);
            announce('Category created.');
          }}
        />
      ) : null}
      {editing && !editing.system ? (
        <CategoryFormDialog
          mode="edit"
          category={editing}
          categories={categories}
          onClose={toList}
          onReadOnly={toList}
          onGone={() => {
            toList();
            setNotice('That category no longer exists.');
            void invalidate();
          }}
          onSaved={(category) => {
            toList();
            setHighlightId(category.id);
            announce(`${category.name} updated.`);
          }}
        />
      ) : null}
      {editing?.system ? (
        <CategoryDetailDialog
          category={editing}
          onClose={toList}
          onCreateOwn={() => toCreate(editing.type)}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteCategoryDialog
          category={deleteTarget}
          categories={categories}
          onClose={() => setDeleteTarget(null)}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onGone={() => {
            setDeleteTarget(null);
            setNotice('That category no longer exists.');
            void invalidate();
          }}
          onReadOnly={() => {
            setDeleteTarget(null);
            void navigate({
              to: '/categories/$categoryId/edit',
              params: { categoryId: deleteTarget.id },
            });
          }}
          onDone={(result) => {
            const message = describeDeletion(deleteTarget.name, result);
            setDeleteTarget(null);
            announce(message);
            toast({ variant: 'success', title: message, duration: 10000 });
            document.querySelector<HTMLElement>('main h1')?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
