import type { CategoryColor } from '@midas/shared';
import { CATEGORY_COLORS, CATEGORY_COLOR_KEYS } from '@midas/shared/categories';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * Swatch picker built from native radios: one tab stop, arrows move and select, selection shows a
 * check glyph and an ink ring (shape cues, never hue alone). Core colors come first (ui-design 18.2.6).
 */
export function ColorPicker({
  value,
  onChange,
  invalid,
  describedBy,
}: {
  value: CategoryColor | null;
  onChange: (color: CategoryColor) => void;
  invalid?: boolean;
  describedBy?: string | undefined;
}) {
  const name = useId();
  const labelId = useId();
  return (
    <fieldset
      id="category-color"
      tabIndex={-1}
      data-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      className="min-w-0"
    >
      <legend className="sr-only">Color</legend>
      <div className="mb-2 flex items-baseline justify-between">
        <span aria-hidden="true" className="text-body-sm font-medium text-ink-2">
          Color
        </span>
        <span id={labelId} className="text-body-sm text-ink-2">
          {value ? CATEGORY_COLORS[value].label : 'None selected'}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-2 pointer-coarse:grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]">
        {CATEGORY_COLOR_KEYS.map((color) => (
          <label key={color} data-cat-color={color} className="relative flex justify-center">
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
              className="peer sr-only"
            />
            <span
              title={CATEGORY_COLORS[color].label}
              className={cn(
                'inline-flex size-9 cursor-pointer items-center justify-center rounded-md bg-(--cat) pointer-coarse:size-11',
                'hover:ring-2 hover:ring-line-strong peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-0',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring',
                'peer-checked:[&>svg]:opacity-100 forced-colors:border forced-colors:border-[CanvasText]',
              )}
            >
              <Check
                aria-hidden="true"
                className="size-[18px] text-white opacity-0 dark:text-[#04201a]"
                strokeWidth={3}
              />
              <span className="sr-only">{CATEGORY_COLORS[color].label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
