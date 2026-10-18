import type { Category } from '@midas/shared';
import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Lock, MoreHorizontal } from 'lucide-react';
import { menuContentClass, menuItemClass } from '@/app/shell/add-menu';
import { CategoryChip } from '@/components/domain/category-chip';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';

function RowMenu({ category, onDelete }: { category: Category; onDelete: (c: Category) => void }) {
  const navigate = useNavigate();
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <IconButton
          label={`Actions for ${category.name}`}
          size="sm"
          className="pointer-coarse:size-11"
          icon={<MoreHorizontal className="size-4" />}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={menuContentClass}>
          <Menu.Item
            className={menuItemClass}
            onSelect={() =>
              void navigate({
                to: '/categories/$categoryId/edit',
                params: { categoryId: category.id },
              })
            }
          >
            Edit category
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item className={`${menuItemClass} text-danger`} onSelect={() => onDelete(category)}>
            Delete category
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function CategoryRow({
  category,
  highlighted,
  onDelete,
}: {
  category: Category;
  highlighted: boolean;
  onDelete: (category: Category) => void;
}) {
  return (
    <li
      data-category-row={category.id}
      className={cn(
        'flex min-h-12 items-center gap-2 border-t border-line first:border-t-0',
        highlighted && 'bg-primary-tint',
      )}
    >
      <Link
        to="/categories/$categoryId/edit"
        params={{ categoryId: category.id }}
        data-category-link={category.id}
        aria-label={`${category.name}, ${category.type} category${category.system ? ', default, read only' : ''}`}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-sm px-1 hover:bg-sunken"
      >
        <CategoryChip icon={category.icon} color={category.color} name={category.name} />
        {category.system ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-caption text-ink-3">
            <Lock aria-hidden="true" className="size-3.5" />
            Default
          </span>
        ) : null}
      </Link>
      {category.system ? null : <RowMenu category={category} onDelete={onDelete} />}
    </li>
  );
}

function Section({
  title,
  headingLevel,
  categories,
  children,
  highlightId,
  onDelete,
}: {
  title: string;
  headingLevel: 'h2' | 'h3';
  categories: readonly Category[];
  children?: ReactNode;
  highlightId: string | null;
  onDelete: (category: Category) => void;
}) {
  const Heading = headingLevel;
  return (
    <section className="mb-4">
      <Heading className="mb-1 text-body-sm font-semibold text-ink-2">
        {title} ({categories.length})
      </Heading>
      {children}
      {categories.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              highlighted={category.id === highlightId}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** One type's sections: "Yours" first, then "Defaults" (ui-design 18.2.5). */
export function TypeSections({
  categories,
  highlightId,
  onDelete,
  onCreate,
  headingLevel = 'h3',
}: {
  categories: readonly Category[];
  highlightId: string | null;
  onDelete: (category: Category) => void;
  onCreate: () => void;
  /** h3 under a type heading (desktop); h2 when the tabs are the only structure above (below lg). */
  headingLevel?: 'h2' | 'h3';
}) {
  const own = categories.filter((category) => !category.system);
  const defaults = categories.filter((category) => category.system);
  return (
    <>
      <Section
        title="Yours"
        headingLevel={headingLevel}
        categories={own}
        highlightId={highlightId}
        onDelete={onDelete}
      >
        {own.length === 0 ? (
          <p className="py-2 text-body-sm text-ink-2">
            You haven&apos;t created categories. Defaults cover most spending.{' '}
            <Button variant="link" onClick={onCreate}>
              Create category
            </Button>
          </p>
        ) : null}
      </Section>
      <Section
        title="Defaults"
        headingLevel={headingLevel}
        categories={defaults}
        highlightId={highlightId}
        onDelete={onDelete}
      />
    </>
  );
}
