import { LOCAL_DATE_MAX, LOCAL_DATE_MIN } from '@midas/shared/money';
import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import { controlBorder, controlClass, type ControlProps } from '@/components/ui/form-field';
import { cn } from '@/lib/cn';

export interface DateFieldProps extends Partial<ControlProps> {
  /** A LocalDate (YYYY-MM-DD) or an empty string. */
  value: string;
  onChange: (value: string) => void;
  /** Today in the user's time zone; enables the Today shortcut. */
  today?: string;
  name?: string;
  min?: string;
  max?: string;
  enterKeyHint?: 'next' | 'done';
  ref?: Ref<HTMLInputElement>;
}

/**
 * Native date input: typed entry in the browser's locale format, a built-in calendar and full
 * keyboard support, all CSP-safe. The value is always a LocalDate string, never a timestamp.
 */
export function DateField({
  value,
  onChange,
  today,
  min = LOCAL_DATE_MIN,
  max = LOCAL_DATE_MAX,
  enterKeyHint,
  ref,
  ...rest
}: DateFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        {...(enterKeyHint ? { enterKeyHint } : {})}
        className={cn(
          controlClass,
          controlBorder(rest['aria-invalid'] === true),
          'h-10 min-w-0 flex-1 pointer-coarse:h-11',
        )}
        {...rest}
      />
      {today ? (
        <Button variant="secondary" size="sm" className="shrink-0" onClick={() => onChange(today)}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
