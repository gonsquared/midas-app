import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** Bare input. Use `Field` for the label, helper and error wiring. 16px so iOS does not zoom. */
export function Input({ invalid = false, className, ref, ...rest }: InputProps) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-sm border bg-surface px-3 text-body text-ink pointer-coarse:h-11',
        'placeholder:text-ink-3 hover:bg-sunken/40 focus-visible:border-ink',
        'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3',
        invalid ? 'border-danger' : 'border-line-strong',
        className,
      )}
      {...rest}
    />
  );
}

export interface FieldProps extends Omit<InputProps, 'id' | 'children'> {
  label: string;
  helper?: ReactNode;
  error?: string | undefined;
  id?: string;
}

/** Persistent label above, helper text, and an error linked with aria-describedby. */
export function Field({ label, helper, error, id, className, ...inputProps }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={inputId} className="text-body-sm font-medium text-ink-2">
        {label}
      </label>
      <Input
        id={inputId}
        invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {helper ? (
        <p id={helperId} className="text-body-sm text-ink-3">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1 text-body-sm text-danger">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
