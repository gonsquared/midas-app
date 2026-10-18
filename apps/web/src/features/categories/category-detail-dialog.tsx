import type { Category } from '@midas/shared';
import { Lock } from 'lucide-react';
import { CategoryChip } from '@/components/domain/category-chip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/** Read-only view of a Midas default category (ui-design 18.2.5). */
export function CategoryDetailDialog({
  category,
  onClose,
  onCreateOwn,
}: {
  category: Category;
  onClose: () => void;
  onCreateOwn: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={category.name} description="Default category">
        <div className="flex flex-col gap-4">
          <CategoryChip
            icon={category.icon}
            color={category.color}
            size="lg"
            name={category.name}
          />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
            <dt className="text-ink-3">Type</dt>
            <dd>{category.type === 'expense' ? 'Expense' : 'Income'}</dd>
          </dl>
          <p className="flex items-start gap-2 text-body-sm text-ink-2">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Default categories are managed by the Midas administrator and can&apos;t be changed or
            deleted.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onCreateOwn}>Create your own category</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
