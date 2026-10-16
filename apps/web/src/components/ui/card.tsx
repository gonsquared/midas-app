import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Panel: surface fill, 1px border, 8px radius, no shadow. Never nest panels. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-md border border-line bg-surface text-ink', className)} {...rest} />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-4 pt-4 sm:px-5', className)} {...rest} />;
}

export function CardTitle({
  as: Tag = 'h3',
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }) {
  return <Tag className={cn('text-subheading font-semibold', className)} {...rest} />;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-4 sm:px-5', className)} {...rest} />;
}
