import type { Category } from '@midas/shared';
import { CategoryChip } from '@/components/domain/category-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface CategoryRowActions {
  onEdit: (category: Category) => void;
  onRetire: (category: Category) => void;
  onRestore: (category: Category) => void;
  /** Category ids with a restore request in flight. */
  restoring?: ReadonlySet<string>;
}

export function AdminCategoriesTable({
  rows,
  type,
  locale,
  actions,
}: {
  rows: readonly Category[];
  type: string;
  locale: string;
  actions: CategoryRowActions;
}) {
  const th = 'py-2 pr-3 font-medium';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">Default {type} categories</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-2">
            <th scope="col" className={th}>
              Category
            </th>
            <th scope="col" className={th}>
              Color
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Updated
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} data-category-row={c.id} className="border-b border-line">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <CategoryChip icon={c.icon} color={c.color} name={c.name} />
              </th>
              <td className="py-2 pr-3">{c.color}</td>
              <td className="py-2 pr-3">
                {c.retired ? (
                  <Badge variant="neutral">Retired</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
              </td>
              <td className="py-2 pr-3">
                {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(c.updatedAt),
                )}
              </td>
              <td className="py-2">
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => actions.onEdit(c)}>
                    Edit <span className="sr-only">{c.name}</span>
                  </Button>
                  {c.retired ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={actions.restoring?.has(c.id) ?? false}
                      onClick={() => actions.onRestore(c)}
                    >
                      Restore <span className="sr-only">{c.name}</span>
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => actions.onRetire(c)}>
                      Retire <span className="sr-only">{c.name}</span>
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
