import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Placeholder block. Hidden from assistive technology; set aria-busy on the loading region and
 * give it the final geometry (via className) so content arrival causes no layout shift.
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-shimmer rounded-sm bg-sunken', className)}
      {...rest}
    />
  );
}
