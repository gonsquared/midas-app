import { Outlet } from '@tanstack/react-router';

/**
 * Static, aria-hidden miniature of the product (ui-design 6.2). Product evidence, not decoration:
 * no images, hidden below 1024px, clearly captioned as sample data.
 */
function LedgerSpecimen() {
  return (
    <aside
      aria-hidden="true"
      className="hidden w-full max-w-md flex-col gap-5 rounded-lg border border-line bg-surface p-6 lg:flex"
    >
      <p className="text-caption font-medium text-ink-3">Sample data</p>
      <div>
        <p className="text-body-sm text-ink-2">Total balance</p>
        <p className="tabular font-display text-figure-lg font-semibold">$12,480.20</p>
        <p className="tabular text-body-sm text-ink-2">
          Income $4,200.00 - Expenses $3,100.00 = Net +$1,100.00
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-body-sm">
          <span>Groceries</span>
          <span className="tabular text-ink-2">$320.00 of $400.00</span>
        </div>
        <div className="relative h-2 rounded-full bg-sunken">
          <div className="h-2 w-4/5 rounded-full bg-primary" />
          <div className="absolute -top-1 left-[60%] h-4 w-0.5 bg-ink" />
        </div>
      </div>
    </aside>
  );
}

/** Layout for signed-out screens: 400px form column, specimen on the right at lg and up. */
export function PublicLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl items-start justify-center gap-16 px-4 py-16 lg:items-center">
      <main id="main-content" tabIndex={-1} className="w-full max-w-[400px]">
        <p className="mb-8 font-display text-heading font-semibold">Midas</p>
        <Outlet />
      </main>
      <LedgerSpecimen />
    </div>
  );
}
