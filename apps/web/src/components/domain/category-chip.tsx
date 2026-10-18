import type { CategoryColor, CategoryIcon } from '@midas/shared';
import { CATEGORY_COLOR_KEYS, FALLBACK_CATEGORY_COLOR } from '@midas/shared/categories';
import { cn } from '@/lib/cn';
import { CATEGORY_ICON_COMPONENTS } from './category-icons';

export function isCategoryIcon(value: string): value is CategoryIcon {
  return Object.hasOwn(CATEGORY_ICON_COMPONENTS, value);
}

export function isCategoryColor(value: string): value is CategoryColor {
  return (CATEGORY_COLOR_KEYS as readonly string[]).includes(value);
}

const SIZES = {
  sm: { box: 'size-6', icon: 'size-3.5' },
  md: { box: 'size-8', icon: 'size-[18px]' },
  lg: { box: 'size-10', icon: 'size-[22px]' },
} as const;

export interface CategoryChipProps {
  /** Stored icon key; an unknown key renders the tag icon. */
  icon: string;
  /** Stored color key; an unknown key renders slate. */
  color: string;
  size?: keyof typeof SIZES;
  /** When present the name follows the chip in ink (never in the category color). */
  name?: string;
  retired?: boolean;
  /** Accessible name for a standalone chip (a chart mark, a color-only context). */
  label?: string;
  className?: string;
}

/**
 * Icon on a tinted rounded square. Identity is icon plus name; color adds speed but never carries
 * meaning alone (ui-design 18.2.2). Color arrives as data-cat-color, so there are no inline styles.
 */
export function CategoryChip({
  icon,
  color,
  size = 'md',
  name,
  retired = false,
  label,
  className,
}: CategoryChipProps) {
  const Icon = CATEGORY_ICON_COMPONENTS[isCategoryIcon(icon) ? icon : 'tag'];
  const colorKey = isCategoryColor(color) ? color : FALLBACK_CATEGORY_COLOR;
  const dimensions = SIZES[size];
  const standalone = name === undefined;
  return (
    <span
      data-cat-color={colorKey}
      className={cn('inline-flex min-w-0 items-center gap-2', className)}
    >
      <span
        {...(standalone && label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-sm bg-(--cat-chip-bg) text-(--cat)',
          dimensions.box,
        )}
      >
        <Icon aria-hidden="true" strokeWidth={2} className={dimensions.icon} />
      </span>
      {name !== undefined ? (
        <span className="min-w-0 truncate text-ink" dir="auto">
          {name}
          {retired ? <span className="ml-1 text-ink-3">Retired</span> : null}
        </span>
      ) : null}
    </span>
  );
}
