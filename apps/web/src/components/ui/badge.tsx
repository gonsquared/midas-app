import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const styles: Record<BadgeVariant, string> = {
  neutral: 'bg-sunken text-ink-2',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  info: 'bg-info-tint text-info',
};

const icons: Record<BadgeVariant, ReactNode> = {
  neutral: null,
  success: <CircleCheck aria-hidden="true" className="size-3.5" />,
  warning: <TriangleAlert aria-hidden="true" className="size-3.5" />,
  danger: <CircleAlert aria-hidden="true" className="size-3.5" />,
  info: <Info aria-hidden="true" className="size-3.5" />,
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** Status is always icon plus text, never color alone. */
export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-medium',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {icons[variant]}
      {children}
    </span>
  );
}
