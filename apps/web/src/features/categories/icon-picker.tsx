import type { CategoryColor, CategoryIcon } from '@midas/shared';
import { CATEGORY_ICONS } from '@midas/shared/categories';
import { CATEGORY_ICON_GROUPS, CATEGORY_ICON_META } from '@midas/shared/category-icon-meta';
import { useEffect, useId, useMemo, useState } from 'react';
import { CATEGORY_ICON_COMPONENTS } from '@/components/domain/category-icons';
import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

function matches(icon: CategoryIcon, needle: string): boolean {
  const meta = CATEGORY_ICON_META[icon];
  return `${meta.label} ${meta.keywords.join(' ')}`.toLowerCase().includes(needle);
}

/**
 * Searchable icon grid of native radios sharing one name (one tab stop across groups). The
 * selected cell previews the chosen color. Loaded lazily by the category dialog (ui-design 18.2.6).
 */
export function IconPicker({
  value,
  color,
  onChange,
  invalid,
}: {
  value: CategoryIcon | null;
  color: CategoryColor | null;
  onChange: (icon: CategoryIcon) => void;
  invalid?: boolean;
}) {
  const name = useId();
  const searchId = useId();
  const announce = useAnnounce();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      CATEGORY_ICON_GROUPS.map((group) => ({
        group,
        icons: CATEGORY_ICONS.filter(
          (icon) => CATEGORY_ICON_META[icon].group === group && (!needle || matches(icon, needle)),
        ),
      })).filter((entry) => entry.icons.length > 0),
    [needle],
  );
  const total = groups.reduce((sum, entry) => sum + entry.icons.length, 0);

  useEffect(() => {
    if (!needle) return undefined;
    const timer = window.setTimeout(
      () => announce(total === 0 ? `No icons match ${query.trim()}` : `${total} icons`),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [announce, needle, query, total]);

  return (
    <fieldset
      id="category-icon"
      tabIndex={-1}
      data-invalid={invalid ? true : undefined}
      {...(color ? { 'data-cat-color': color } : {})}
      className="min-w-0"
    >
      <legend className="sr-only">Icon</legend>
      <div className="mb-2 flex items-baseline justify-between">
        <span aria-hidden="true" className="text-body-sm font-medium text-ink-2">
          Icon
        </span>
        <span className="text-body-sm text-ink-2">
          {value ? CATEGORY_ICON_META[value].label : 'None selected'}
        </span>
      </div>
      <label htmlFor={searchId} className="text-body-sm font-medium text-ink-2">
        Search icons
      </label>
      <input
        id={searchId}
        type="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query) {
            event.preventDefault();
            event.stopPropagation();
            setQuery('');
          }
        }}
        className="mt-1 mb-3 h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-body text-ink focus-visible:border-ink pointer-coarse:h-11"
      />
      {total === 0 ? (
        <div className="flex flex-col items-start gap-2 py-2 text-body-sm text-ink-2">
          <p>No icons match &quot;{query.trim()}&quot;.</p>
          <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </div>
      ) : null}
      {groups.map(({ group, icons }) => (
        <div key={group} className="mb-3">
          <h3 className="mb-1 text-body-sm font-semibold text-ink">{group}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1 pointer-coarse:grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]">
            {icons.map((icon) => {
              const Icon = CATEGORY_ICON_COMPONENTS[icon];
              return (
                <label key={icon} className="relative flex justify-center">
                  <input
                    type="radio"
                    name={name}
                    value={icon}
                    checked={value === icon}
                    onChange={() => onChange(icon)}
                    className="peer sr-only"
                  />
                  <span
                    title={CATEGORY_ICON_META[icon].label}
                    className={cn(
                      'inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-ink-2 pointer-coarse:size-11',
                      'hover:bg-sunken peer-checked:bg-(--cat-chip-bg) peer-checked:text-(--cat)',
                      'peer-checked:ring-2 peer-checked:ring-ink',
                      'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
                    <span className="sr-only">{CATEGORY_ICON_META[icon].label}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
