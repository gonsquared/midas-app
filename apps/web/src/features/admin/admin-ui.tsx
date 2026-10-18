import type { ReactNode } from 'react';

/** The privacy line shown on every admin screen (ADR-018). */
export function PrivacyLine() {
  return (
    <p className="mb-6 max-w-[70ch] text-body-sm text-ink-2" data-testid="admin-privacy">
      Admin tools show account status and platform totals only. They never show anyone&apos;s
      transactions.
    </p>
  );
}

export function AdminHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
      <h1
        tabIndex={-1}
        className="font-display text-[1.5rem] leading-[1.875rem] font-semibold sm:text-title"
      >
        {title}
      </h1>
      {children}
    </div>
  );
}

/** Whole-number share, for example 812 of 1204 -> 67 (integer math, rounded down). */
export function share(part: number, whole: number): number {
  return whole <= 0 ? 0 : Number((BigInt(part) * 100n) / BigInt(whole));
}

/** A part-to-whole bar built from SVG attributes (no inline style). */
export function ProportionBar({ percent, label }: { percent: number; label: string }) {
  return (
    <svg role="img" aria-label={label} width="100%" height="8" className="block">
      <rect width="100%" height="8" rx="4" className="fill-sunken" />
      <rect width={`${percent}%`} height="8" rx="4" className="fill-primary" />
    </svg>
  );
}
