import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, MouseEvent, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ' +
  'transition-colors duration-[140ms] active:translate-y-px active:duration-[80ms] ' +
  'aria-disabled:cursor-not-allowed aria-disabled:bg-sunken aria-disabled:text-ink-3 ' +
  'aria-disabled:border-line aria-disabled:active:translate-y-0 disabled:cursor-not-allowed ' +
  'disabled:bg-sunken disabled:text-ink-3';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
  ghost: 'bg-transparent text-ink hover:bg-sunken',
  danger: 'bg-danger text-on-danger hover:brightness-95',
  link: 'h-auto rounded-sm px-0 text-primary underline underline-offset-2 hover:text-primary-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 min-w-8 px-3 text-body-sm',
  md: 'h-10 min-w-10 px-4 text-body-sm pointer-coarse:h-11 pointer-coarse:min-w-11',
  lg: 'h-11 min-w-11 px-5 text-body',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and ignores repeat activation. The label and width stay. */
  loading?: boolean;
  /** Render the child element (for example a router Link) with button styling. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  asChild = false,
  className,
  children,
  onClick,
  type = 'button',
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  const classes = cn(base, variants[variant], variant === 'link' ? '' : sizes[size], className);
  const inert = loading || disabled === true;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  if (asChild) {
    return (
      // A non-button child (such as a link) has no native disabled state, so expose it with
      // aria-disabled and swallow activation. ref and onClick stay wired to the child.
      <Slot
        {...(rest as object)}
        ref={ref as Ref<HTMLElement>}
        className={classes}
        aria-busy={loading || undefined}
        aria-disabled={inert || undefined}
        onClick={handleClick as (event: MouseEvent<HTMLElement>) => void}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
