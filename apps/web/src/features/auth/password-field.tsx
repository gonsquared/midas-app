import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState, type ReactNode, type Ref } from 'react';
import { FieldFrame } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  error?: string | undefined;
  helper?: ReactNode;
  id?: string;
  name?: string;
  /** Strength meter or requirements shown under the field. */
  children?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** Masked by default with an explicit show/hide toggle (aria-pressed), per ui-design 15.1. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  error,
  helper,
  id,
  name,
  children,
  ref,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  // Never leave a revealed password behind when the field is emptied (for example after success).
  useEffect(() => {
    if (value === '') setVisible(false);
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <FieldFrame label={label} error={error} helper={helper} id={id}>
        {(control) => (
          <div className="relative">
            <Input
              ref={ref}
              {...control}
              name={name}
              type={visible ? 'text' : 'password'}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              autoComplete={autoComplete}
              autoCapitalize="none"
              spellCheck={false}
              className={cn('pr-12')}
              invalid={control['aria-invalid'] === true}
            />
            <button
              type="button"
              aria-pressed={visible}
              aria-label="Show password"
              onClick={() => setVisible((current) => !current)}
              className="absolute top-0 right-0 inline-flex size-10 items-center justify-center rounded-sm text-ink-2 hover:text-ink pointer-coarse:size-11"
            >
              {visible ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        )}
      </FieldFrame>
      {children}
    </div>
  );
}
