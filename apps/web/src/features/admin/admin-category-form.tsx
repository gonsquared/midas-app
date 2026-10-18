import type { Category, CategoryType } from '@midas/shared';
import { CATEGORY_NAME_MAX_LENGTH } from '@midas/shared/categories';
import { lazy, Suspense, useRef, useState, type FormEvent } from 'react';
import { CategoryChip, isCategoryColor, isCategoryIcon } from '@/components/domain/category-chip';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldFrame } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { ColorPicker } from '@/features/categories/color-picker';
import { validateCategoryForm, type CategoryFormValues } from '@/features/categories/category-form';
import { applyProblemToForm } from '@/lib/problem-form';
import { createSystemCategory, updateSystemCategory, useInvalidateAdmin } from './api';

const IconPicker = lazy(() =>
  import('@/features/categories/icon-picker').then((m) => ({ default: m.IconPicker })),
);
const TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;

export interface AdminCategoryFormProps {
  mode: 'create' | 'edit';
  category?: Category;
  presetType: CategoryType;
  onClose: () => void;
  onSaved: (category: Category) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function AdminCategoryForm(props: AdminCategoryFormProps) {
  const { mode, category, onClose, onSaved, onCloseAutoFocus } = props;
  const invalidate = useInvalidateAdmin();
  const nameRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<CategoryFormValues>({
    name: category?.name ?? '',
    type: category?.type ?? props.presetType,
    color: category && isCategoryColor(category.color) ? category.color : 'blue',
    icon: category && isCategoryIcon(category.icon) ? category.icon : 'tag',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CategoryFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found = validateCategoryForm(values);
    setErrors(found);
    setFormError(null);
    setFailure(null);
    if (Object.keys(found).length > 0 || !values.color || !values.icon) return;
    setPending(true);
    try {
      const name = values.name.trim();
      let saved: Category;
      if (mode === 'edit' && category) {
        const patch = {
          ...(name !== category.name ? { name } : {}),
          ...(values.icon !== category.icon ? { icon: values.icon } : {}),
          ...(values.color !== category.color ? { color: values.color } : {}),
        };
        // Nothing changed: no request (an empty PATCH is pointless and may be rejected).
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        saved = await updateSystemCategory(category.id, patch);
      } else {
        saved = await createSystemCategory({
          name,
          type: values.type,
          icon: values.icon,
          color: values.color,
        });
      }
      await invalidate();
      onSaved(saved);
    } catch (caught) {
      const mapped = applyProblemToForm(caught, {
        fieldMap: { name: 'name', icon: 'icon', color: 'color' },
        codeRules: {
          CATEGORY_NAME_TAKEN: {
            field: 'name',
            message: `A default ${values.type} category already has this name.`,
          },
        },
      });
      setErrors(mapped.fields);
      if (Object.keys(mapped.fields).length > 0) return;
      if (mapped.status && mapped.status < 500 && mapped.status > 0) setFormError(mapped.form);
      else setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={mode === 'create' ? 'Create default category' : 'Edit default category'}
        className="sm:max-w-[32.5rem]"
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <CategoryChip
            icon={values.icon ?? 'tag'}
            color={values.color ?? 'slate'}
            size="lg"
            name={values.name.trim() || 'Category name'}
          />
          {formError ? <Alert variant="danger">{formError}</Alert> : null}
          {failure ? <ApiErrorAlert error={failure} /> : null}
          <FieldFrame
            id="admin-category-name"
            label="Name"
            required
            error={errors.name}
            meta={`${values.name.length} / ${CATEGORY_NAME_MAX_LENGTH}`}
          >
            {(control) => (
              <Input
                {...control}
                ref={nameRef}
                autoComplete="off"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                invalid={control['aria-invalid'] === true}
              />
            )}
          </FieldFrame>
          {mode === 'create' ? (
            <Segmented
              legend="Type"
              legendHidden={false}
              options={TYPES}
              value={values.type}
              onChange={(type) => setValues((v) => ({ ...v, type }))}
            />
          ) : null}
          <ColorPicker
            value={values.color}
            invalid={Boolean(errors.color)}
            onChange={(color) => setValues((v) => ({ ...v, color }))}
          />
          <Suspense fallback={<Skeleton className="h-48" />}>
            <IconPicker
              value={values.icon}
              color={values.color}
              invalid={Boolean(errors.icon)}
              onChange={(icon) => setValues((v) => ({ ...v, icon }))}
            />
          </Suspense>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {mode === 'create' ? 'Create category' : 'Save changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
