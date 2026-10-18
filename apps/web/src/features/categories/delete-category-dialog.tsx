import type { Category, DeleteCategoryResponse } from '@midas/shared';
import { useEffect, useMemo, useState } from 'react';
import { CategoryChip } from '@/components/domain/category-chip';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FieldFrame } from '@/components/ui/form-field';
import { ApiError } from '@/lib/api-client';
import { deleteCategory, useInvalidateCategories } from './api';
import { disambiguatedLabels } from './category-form';

const TARGET_ID = 'category-reassign-target';

export interface DeleteCategoryDialogProps {
  category: Category;
  categories: readonly Category[];
  onClose: () => void;
  onDone: (result: DeleteCategoryResponse) => void;
  onGone: () => void;
  onReadOnly: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/** Plain sentence for the result toast; zero counts are omitted (ui-design 18.2.7). */
export function describeDeletion(name: string, result: DeleteCategoryResponse): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (result.reassignedTransactions > 0) {
    parts.push(`Moved ${plural(result.reassignedTransactions, 'transaction', 'transactions')}`);
  }
  if (result.reassignedTemplates > 0) {
    const text = plural(
      result.reassignedTemplates,
      'recurring transaction',
      'recurring transactions',
    );
    parts.push(parts.length === 0 ? `Moved ${text}` : `and ${text}`);
  }
  const moved = parts.join(' ');
  const budgets =
    result.deletedBudgets > 0
      ? `Deleted ${plural(result.deletedBudgets, 'budget', 'budgets')}.`
      : '';
  return [`${name} deleted.`, moved ? `${moved}.` : '', budgets].filter(Boolean).join(' ');
}

export function DeleteCategoryDialog({
  category,
  categories,
  onClose,
  onDone,
  onGone,
  onReadOnly,
  onCloseAutoFocus,
}: DeleteCategoryDialogProps) {
  const invalidate = useInvalidateCategories();
  const [step, setStep] = useState<'confirm' | 'reassign'>('confirm');
  const [target, setTarget] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | undefined>();

  const options = useMemo<ComboboxOption[]>(() => {
    const eligible = categories.filter(
      (c) => c.type === category.type && !c.retired && c.id !== category.id,
    );
    const labels = disambiguatedLabels(eligible);
    return eligible.map((c) => ({
      value: c.id,
      label: labels.get(c.id) ?? c.name,
      group: c.system ? 'Defaults' : 'Yours',
      leading: <CategoryChip icon={c.icon} color={c.color} size="sm" />,
    }));
  }, [categories, category.id, category.type]);

  useEffect(() => {
    if (step === 'reassign') document.getElementById(TARGET_ID)?.focus();
  }, [step]);

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        step === 'confirm'
          ? `Delete ${category.name}?`
          : `Move ${category.name} to another category`
      }
      consequences={
        step === 'confirm'
          ? [
              "Budgets that use it are deleted too. If transactions or recurring transactions use it, you'll choose where to move them next.",
            ]
          : []
      }
      reversibleNote={step === 'confirm' ? "This can't be undone." : undefined}
      confirmLabel={step === 'confirm' ? 'Delete category' : 'Delete and reassign'}
      confirmBlocked={step === 'reassign' && !target}
      confirmHint="Choose a category to continue."
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      extraActions={
        step === 'reassign' ? (
          <Button variant="secondary" onClick={() => setStep('confirm')}>
            Back
          </Button>
        ) : undefined
      }
      onConfirm={async () => {
        try {
          const result = await deleteCategory(
            category.id,
            step === 'reassign' ? (target ?? undefined) : undefined,
          );
          await invalidate();
          onDone(result);
        } catch (caught) {
          if (caught instanceof ApiError) {
            if (caught.code === 'CATEGORY_IN_USE') return void setStep('reassign');
            if (caught.code === 'NOT_FOUND') return onGone();
            if (caught.code === 'SYSTEM_CATEGORY_READ_ONLY') return onReadOnly();
            if (caught.code === 'REASSIGN_TARGET_INVALID') {
              setTargetError("That category can't be used. Choose another.");
              setTarget(null);
              void invalidate();
              return;
            }
          }
          throw caught;
        }
      }}
    >
      {step === 'reassign' ? (
        <>
          <p>
            Some transactions or recurring transactions use {category.name}. Choose where to move
            them.
          </p>
          <FieldFrame id={TARGET_ID} label="Move to" error={targetError} required>
            {(control) => (
              <Combobox
                {...control}
                options={options}
                value={target}
                onChange={(value) => {
                  setTarget(value);
                  setTargetError(undefined);
                }}
                emptyText="There are no other categories of this type."
              />
            )}
          </FieldFrame>
          <p>Budgets for {category.name} will be deleted.</p>
        </>
      ) : null}
    </ConfirmDialog>
  );
}
