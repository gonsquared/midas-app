import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const styles: Record<AlertVariant, string> = {
  info: 'border-info bg-info-tint',
  success: 'border-success bg-success-tint',
  warning: 'border-warning bg-warning-tint',
  danger: 'border-danger bg-danger-tint',
};

const iconStyles: Record<AlertVariant, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const icons: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: ReactNode;
  /** Trailing action such as a Try again button. */
  action?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Inline, persistent message: always icon plus text (never color alone). Danger alerts announce
 * assertively (role alert); everything else is a polite status. Override with `role`.
 */
export function Alert({
  variant = 'info',
  title,
  action,
  className,
  children,
  role,
  ref,
  ...rest
}: AlertProps) {
  const Icon = icons[variant];
  return (
    <div
      ref={ref}
      role={role ?? (variant === 'danger' ? 'alert' : 'status')}
      className={cn(
        'flex items-start gap-3 rounded-md border-l-4 p-3 text-body-sm text-ink',
        styles[variant],
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', iconStyles[variant])} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-ink-2">{children}</div> : null}
        {action ? <div className="mt-1 flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
