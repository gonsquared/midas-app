import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** One-line hint (RadioCardGroup only). */
  description?: string;
}

interface GroupProps<T extends string> {
  legend: string;
  /** Visible legend by default; set to hide it visually while keeping it for assistive tech. */
  legendHidden?: boolean;
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
  /** Called when a segment is picked by keyboard or pointer (for focus management). */
  'aria-describedby'?: string | undefined;
}

const focusRing =
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring';

/**
 * Segmented control built from native radio buttons (one tab stop, arrow keys move and select).
 * The input is visually hidden; the label is the visual. See ui-design 18.0.1.
 */
export function Segmented<T extends string>({
  legend,
  legendHidden = true,
  options,
  value,
  onChange,
  name,
  disabled = false,
  className,
  ...rest
}: GroupProps<T>) {
  const generated = useId();
  const groupName = name ?? generated;
  return (
    <fieldset className={cn('min-w-0', className)} disabled={disabled} {...rest}>
      <legend className={cn(legendHidden ? 'sr-only' : 'mb-1 text-body-sm font-medium text-ink-2')}>
        {legend}
      </legend>
      <div className="inline-flex w-full rounded-md border border-line-strong bg-surface p-0.5 sm:w-auto">
        {options.map((option) => (
          <label key={option.value} className="relative flex min-w-0 flex-1 sm:flex-none">
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'inline-flex min-h-9 min-w-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-3',
                'text-body-sm font-medium text-ink-2 hover:bg-sunken pointer-coarse:min-h-11 pointer-coarse:min-w-11',
                'peer-checked:bg-primary-tint peer-checked:font-semibold peer-checked:text-ink',
                'peer-checked:shadow-[inset_0_-3px_0_var(--color-primary)]',
                'peer-disabled:cursor-not-allowed peer-disabled:text-ink-3',
                focusRing,
              )}
            >
              {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Radio cards: same native engine as Segmented, each option is a card with an optional hint. */
export function RadioCardGroup<T extends string>({
  legend,
  legendHidden = false,
  options,
  value,
  onChange,
  name,
  disabled = false,
  className,
  ...rest
}: GroupProps<T>) {
  const generated = useId();
  const groupName = name ?? generated;
  return (
    <fieldset className={cn('min-w-0', className)} disabled={disabled} {...rest}>
      <legend className={cn(legendHidden ? 'sr-only' : 'mb-1 text-body-sm font-medium text-ink-2')}>
        {legend}
      </legend>
      <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className="relative flex min-w-0">
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex min-h-14 w-full cursor-pointer items-start gap-3 rounded-md border border-line-strong bg-surface p-3',
                'hover:bg-sunken/60 peer-checked:border-primary peer-checked:bg-primary-tint',
                'peer-checked:shadow-[inset_0_0_0_1px_var(--color-primary)]',
                'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
                focusRing,
              )}
            >
              {option.icon ? (
                <span aria-hidden="true" className="mt-0.5 text-ink-2">
                  {option.icon}
                </span>
              ) : null}
              <span className="flex min-w-0 flex-col">
                <span className="text-body-sm font-medium text-ink">{option.label}</span>
                {option.description ? (
                  <span className="text-caption text-ink-3">{option.description}</span>
                ) : null}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
