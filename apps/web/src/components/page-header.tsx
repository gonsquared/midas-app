import type { ReactNode } from 'react';

/** Page title (the h1). Focus moves here on route change, hence tabIndex -1. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <h1
        tabIndex={-1}
        className="font-display text-[1.5rem] leading-[1.875rem] font-semibold text-ink sm:text-title"
      >
        {title}
      </h1>
      {children ? <p className="max-w-[70ch] text-body text-ink-2">{children}</p> : null}
    </div>
  );
}
