import type { ReactNode } from 'react';

/** Title, one sentence, and an optional action. No decorative illustration. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-start gap-3 border-t border-line py-8">
      <h2 className="font-display text-heading text-ink">{title}</h2>
      <p className="max-w-[70ch] text-body text-ink-2">{children}</p>
      {action}
    </section>
  );
}
