import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'role' | 'onChange' | 'children'
> {
  /** Visible text label. The switch is always labelled in text, never by color or position. */
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ref?: Ref<HTMLInputElement>;
}

/** Native checkbox with role switch: real keyboard and form semantics, no div toggle. */
export function Switch({
  label,
  checked,
  onCheckedChange,
  className,
  id,
  ref,
  ...rest
}: SwitchProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex min-h-10 cursor-pointer items-center gap-3 text-body-sm text-ink pointer-coarse:min-h-11',
        className,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer sr-only"
        {...rest}
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-block h-6 w-11 shrink-0 rounded-full border border-line-strong bg-sunken',
          'transition-colors duration-[140ms] peer-checked:border-primary peer-checked:bg-primary',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring',
          'peer-disabled:opacity-60 forced-colors:peer-checked:bg-[Highlight]',
          'peer-checked:[&>span]:translate-x-5 peer-checked:[&>span]:bg-on-primary',
        )}
      >
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-ink-2 transition-transform duration-[140ms]" />
      </span>
      <span>{label}</span>
    </label>
  );
}
