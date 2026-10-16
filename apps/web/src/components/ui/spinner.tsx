import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Local-action spinner. Decorative: pair it with visible or hidden text for the status. */
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" className={cn('size-4 animate-spin', className)} />;
}
