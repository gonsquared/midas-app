import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required accessible name. Icon-only controls never rely on the glyph alone. */
  label: string;
  icon: ReactNode;
  size?: 'sm' | 'md';
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  icon,
  size = 'md',
  className,
  type = 'button',
  ref,
  ...rest
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-ink transition-colors',
        'duration-[140ms] hover:bg-sunken active:translate-y-px disabled:text-ink-3',
        size === 'sm' ? 'size-8' : 'size-10 pointer-coarse:size-11',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}
