import { Link } from '@tanstack/react-router';
import type { AnchorHTMLAttributes, MouseEvent, Ref } from 'react';
import { cn } from '@/lib/cn';
import type { NavItem } from './nav-config';

/**
 * One navigation link. `aria-current="page"` and data-status="active" come from the router.
 * When `showLabel` is false the label stays in the accessibility tree (sr-only).
 */
export interface NavLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'children' | 'href'
> {
  item: NavItem;
  showLabel: boolean;
  onNavigate?: () => void;
  ref?: Ref<HTMLAnchorElement>;
}

/**
 * Forwards ref and rest props to the Link so it can be a Radix asChild trigger (Tooltip
 * needs the ref and its focus/pointer handlers on the real anchor).
 */
export function NavLink({
  item,
  showLabel,
  onNavigate,
  onClick,
  className,
  ref,
  ...rest
}: NavLinkProps) {
  const Icon = item.icon;
  return (
    <Link
      {...rest}
      ref={ref}
      to={item.to}
      activeOptions={{ exact: item.exact ?? false }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        onNavigate?.();
      }}
      className={cn(
        'flex h-10 items-center gap-3 rounded-md border-l-[3px] border-transparent px-3',
        'text-body-sm font-medium text-ink-2 hover:bg-sunken hover:text-ink',
        'data-[status=active]:border-primary data-[status=active]:bg-primary-tint',
        'data-[status=active]:text-ink pointer-coarse:h-11',
        !showLabel && 'justify-center px-0',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className={showLabel ? undefined : 'sr-only'}>{item.label}</span>
    </Link>
  );
}
