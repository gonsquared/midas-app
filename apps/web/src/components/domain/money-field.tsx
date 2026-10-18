import type { Ref } from 'react';
import { controlBorder, controlClass, type ControlProps } from '@/components/ui/form-field';
import { cn } from '@/lib/cn';

export interface MoneyFieldProps extends Partial<ControlProps> {
  /** What the user typed. Parse it with parseAmountInput on submit or blur. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  currency: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  large?: boolean;
  enterKeyHint?: 'next' | 'done';
  ref?: Ref<HTMLInputElement>;
}

/**
 * Text input for money (never type=number: no spinners, no locale surprises). Digits are
 * validated by parseAmountInput; the currency code sits beside the input as a visible adornment.
 */
export function MoneyField({
  value,
  onChange,
  onBlur,
  currency,
  large = false,
  enterKeyHint,
  ref,
  ...rest
}: MoneyFieldProps) {
  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        {...(enterKeyHint ? { enterKeyHint } : {})}
        className={cn(
          controlClass,
          controlBorder(rest['aria-invalid'] === true),
          'pr-14 tabular',
          large ? 'h-14 text-figure-lg' : 'h-10 pointer-coarse:h-11',
        )}
        {...rest}
      />
      <span
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-body-sm text-ink-3"
        data-testid="money-currency"
      >
        {currency}
      </span>
    </div>
  );
}
