import { TriangleAlert } from 'lucide-react';
import { useId, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldFrameProps {
  label: ReactNode;
  helper?: ReactNode;
  error?: string | undefined;
  id?: string | undefined;
  /** Text shown on the label row, right aligned (for example a character counter). */
  meta?: ReactNode;
  className?: string | undefined;
  required?: boolean | undefined;
  children: (control: ControlProps) => ReactNode;
}

/** Persistent label above any control, with helper and error text linked via aria-describedby. */
export function FieldFrame({
  label,
  helper,
  error,
  id,
  meta,
  className,
  required,
  children,
}: FieldFrameProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const helperId = `${controlId}-helper`;
  const errorId = `${controlId}-error`;
  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={controlId} className="text-body-sm font-medium text-ink-2">
          {label}
          {required ? (
            <span aria-hidden="true" className="text-danger">
              {' *'}
            </span>
          ) : null}
        </label>
        {meta ? <span className="text-caption text-ink-3">{meta}</span> : null}
      </div>
      {children({
        id: controlId,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {helper ? (
        <p id={helperId} className="text-body-sm text-ink-3">
          {helper}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1 text-body-sm text-danger">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export const controlClass =
  'w-full rounded-sm border bg-surface px-3 text-body text-ink pointer-coarse:min-h-11 ' +
  'placeholder:text-ink-3 hover:bg-sunken/40 focus-visible:border-ink ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3 read-only:bg-sunken/60';

export function controlBorder(invalid: boolean): string {
  return invalid ? 'border-danger' : 'border-line-strong';
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ invalid = false, className, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClass, controlBorder(invalid), 'min-h-20 py-2', className)}
      {...rest}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface NativeSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  invalid?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
  'aria-describedby'?: string | undefined;
  'aria-label'?: string;
  ref?: Ref<HTMLSelectElement>;
}

/**
 * Native select. Radix Select mounts react-remove-scroll, which injects a style element and is
 * blocked by the strict CSP, so short pick-one lists use the platform control (ui-design 18.0.1).
 */
export function NativeSelect({
  value,
  onChange,
  options,
  invalid = false,
  className,
  ref,
  ...rest
}: NativeSelectProps) {
  return (
    <select
      ref={ref}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cn(controlClass, controlBorder(invalid), 'h-10 pointer-coarse:h-11', className)}
      {...rest}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
