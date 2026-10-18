import type { Category, CategoryColor, CategoryIcon, CategoryType } from '@midas/shared';
import { CATEGORY_NAME_MAX_LENGTH } from '@midas/shared/categories';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBreakpoint } from '@/app/shell/use-breakpoint';
import { CategoryChip, isCategoryColor, isCategoryIcon } from '@/components/domain/category-chip';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { FieldFrame } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { focusFirstInvalid } from '@/lib/focus';
import { applyProblemToForm } from '@/lib/problem-form';
import { createCategory, updateCategory, useInvalidateCategories } from './api';
import {
  suggestColor,
  validateCategoryForm,
  type CategoryFormErrors,
  type CategoryFormValues,
} from './category-form';
import { ColorPicker } from './color-picker';

const IconPicker = lazy(() => import('./icon-picker').then((m) => ({ default: m.IconPicker })));

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;

export interface CategoryFormDialogProps {
  mode: 'create' | 'edit';
  category?: Category;
  presetType?: CategoryType;
  /** All categories, to suggest a color and to know what is already used. */
  categories: readonly Category[];
  onClose: () => void;
  onSaved: (category: Category) => void;
  /** The category no longer exists (404). */
  onGone: () => void;
  /** The category turned out to be a read-only default (403). */
  onReadOnly: () => void;
}

function initialValues(props: CategoryFormDialogProps): CategoryFormValues {
  const { category } = props;
  if (category) {
    return {
      name: category.name,
      type: category.type,
      color: isCategoryColor(category.color) ? category.color : null,
      icon: isCategoryIcon(category.icon) ? category.icon : null,
    };
  }
  const type = props.presetType ?? 'expense';
  return { name: '', type, color: suggestColor(props.categories, type), icon: 'tag' };
}

export function CategoryFormDialog(props: CategoryFormDialogProps) {
  const { mode, category, categories, onClose, onSaved, onGone, onReadOnly } = props;
  const breakpoint = useBreakpoint();
  const invalidate = useInvalidateCategories();
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const initial = useMemo(() => initialValues(props), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<CategoryFormValues>(initial);
  const [colorTouched, setColorTouched] = useState(false);
  const [errors, setErrors] = useState<CategoryFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty =
    values.name.trim() !== initial.name.trim() ||
    values.color !== initial.color ||
    values.icon !== initial.icon ||
    (mode === 'create' && values.type !== initial.type);

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  const set = <K extends keyof CategoryFormValues>(key: K, value: CategoryFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const changeType = (type: CategoryType) => {
    setValues((current) => ({
      ...current,
      type,
      color: colorTouched ? current.color : suggestColor(categories, type),
    }));
  };
  const requestClose = () => {
    if (dirty && !pending) setConfirmDiscard(true);
    else onClose();
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || (mode === 'edit' && !dirty)) return;
    const found = validateCategoryForm(values);
    setErrors(found);
    setFormError(null);
    setFailure(null);
    if (Object.keys(found).length > 0 || !values.color || !values.icon) {
      setAttempt((count) => count + 1);
      return;
    }
    const name = values.name.trim();
    setPending(true);
    try {
      const saved =
        mode === 'edit' && category
          ? await updateCategory(category.id, {
              ...(name !== category.name ? { name } : {}),
              ...(values.icon !== initial.icon ? { icon: values.icon } : {}),
              ...(values.color !== initial.color ? { color: values.color } : {}),
            })
          : await createCategory({
              name,
              type: values.type,
              icon: values.icon,
              color: values.color,
            });
      await invalidate();
      onSaved(saved);
    } catch (caught) {
      const mapped = applyProblemToForm(caught, {
        fieldMap: { name: 'name', icon: 'icon', color: 'color' },
        codeRules: {
          CATEGORY_NAME_TAKEN: {
            field: 'name',
            message: `You already have an ${values.type} category with this name.`,
          },
          LIMIT_REACHED: { message: "You've reached the limit of 200 categories." },
        },
      });
      if (mapped.code === 'NOT_FOUND') return onGone();
      if (mapped.code === 'SYSTEM_CATEGORY_READ_ONLY') return onReadOnly();
      setErrors(mapped.fields as CategoryFormErrors);
      if (Object.keys(mapped.fields).length > 0) setAttempt((count) => count + 1);
      else if (mapped.status && mapped.status > 0 && mapped.status < 500) setFormError(mapped.form);
      else setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  const summary: SummaryError[] = (Object.keys(errors) as Array<keyof CategoryFormValues>).flatMap(
    (field) => {
      const message = errors[field];
      return message
        ? [{ id: `category-${field}`, label: field[0]!.toUpperCase() + field.slice(1), message }]
        : [];
    },
  );
  const nameLength = values.name.length;
  const unknownIcon = mode === 'edit' && category && !isCategoryIcon(category.icon);
  const unknownColor = mode === 'edit' && category && !isCategoryColor(category.color);
  const previewIcon: CategoryIcon | string = values.icon ?? 'tag';
  const previewColor: CategoryColor | string = values.color ?? 'slate';

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          title={mode === 'create' ? 'Create category' : 'Edit category'}
          variant={breakpoint === 'mobile' ? 'sheet' : 'dialog'}
          className="sm:max-w-[32.5rem]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameRef.current?.focus();
          }}
        >
          <form
            ref={formRef}
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-4"
          >
            <div
              aria-label="Preview"
              role="group"
              className="sticky top-0 z-10 -mx-1 flex items-center gap-3 rounded-md border border-line bg-raised p-3"
            >
              <span className="text-body-sm text-ink-3">Preview</span>
              <CategoryChip
                icon={previewIcon}
                color={previewColor}
                size="lg"
                name={values.name.trim() || 'Category name'}
              />
            </div>
            <ErrorSummary errors={summary} />
            {formError ? <Alert variant="danger">{formError}</Alert> : null}
            {failure ? <ApiErrorAlert error={failure} /> : null}
            <FieldFrame
              id="category-name"
              label="Name"
              required
              error={errors.name}
              meta={
                <span aria-hidden="true">
                  {nameLength} / {CATEGORY_NAME_MAX_LENGTH}
                </span>
              }
            >
              {(control) => (
                <Input
                  ref={nameRef}
                  {...control}
                  name="name"
                  autoComplete="off"
                  value={values.name}
                  onChange={(e) => set('name', e.target.value)}
                  invalid={control['aria-invalid'] === true}
                />
              )}
            </FieldFrame>
            {mode === 'create' ? (
              <Segmented
                legend="Type"
                legendHidden={false}
                options={TYPE_OPTIONS}
                value={values.type}
                onChange={changeType}
              />
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-body-sm font-medium text-ink-2">Type</span>
                <p className="text-body text-ink">
                  {values.type === 'expense' ? 'Expense' : 'Income'}
                </p>
                <p className="text-body-sm text-ink-3">Type can&apos;t be changed.</p>
              </div>
            )}
            {unknownColor ? (
              <Alert variant="warning">This color is no longer available. Choose another.</Alert>
            ) : null}
            <ColorPicker
              value={values.color}
              invalid={Boolean(errors.color)}
              onChange={(color) => {
                setColorTouched(true);
                set('color', color);
              }}
            />
            {unknownIcon ? (
              <Alert variant="warning">This icon is no longer available. Choose another.</Alert>
            ) : null}
            <Suspense fallback={<Skeleton className="h-48" />}>
              <IconPicker
                value={values.icon}
                color={values.color}
                invalid={Boolean(errors.icon)}
                onChange={(icon) => set('icon', icon)}
              />
            </Suspense>
            {mode === 'create' && values.icon === 'tag' ? (
              <p className="-mt-2 text-body-sm text-ink-3">Choose an icon, or keep the tag.</p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              {mode === 'edit' && !dirty ? (
                <p id="category-no-changes" className="text-body-sm text-ink-3 sm:mr-auto">
                  No changes to save.
                </p>
              ) : null}
              <Button variant="secondary" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={pending}
                aria-disabled={(mode === 'edit' && !dirty) || undefined}
                aria-describedby={mode === 'edit' && !dirty ? 'category-no-changes' : undefined}
              >
                {mode === 'create' ? 'Create category' : 'Save changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this category?"
        consequences={['Your changes will be lost.']}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
