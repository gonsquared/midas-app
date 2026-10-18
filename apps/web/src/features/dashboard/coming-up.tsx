import type { RecurringTemplate } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { Amount } from '@/components/domain/amount';
import { addDays, formatLocalDate } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { panelClass, panelLinkClass } from './budgets-panel';

const UPCOMING_DAYS = 14;

/** Active templates whose next run falls within the next 14 days (ui-design 6.3). */
export function upcomingTemplates(
  templates: readonly RecurringTemplate[],
  today: string,
): RecurringTemplate[] {
  const horizon = addDays(today, UPCOMING_DAYS);
  return templates
    .filter(
      (t) => t.status === 'active' && t.nextRunOn && t.nextRunOn >= today && t.nextRunOn <= horizon,
    )
    .sort((a, b) => (a.nextRunOn ?? '').localeCompare(b.nextRunOn ?? ''));
}

export function ComingUp({
  templates,
  today,
}: {
  templates: readonly RecurringTemplate[];
  today: string;
}) {
  const { locale } = usePreferences();
  const upcoming = upcomingTemplates(templates, today);
  if (upcoming.length === 0) return null;
  return (
    <section aria-labelledby="coming-up-heading" className={panelClass}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="coming-up-heading" className="font-display text-heading">
          Coming up (next {UPCOMING_DAYS} days)
        </h2>
        <Link to="/recurring" className={panelLinkClass}>
          Manage
        </Link>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
        {upcoming.map((template) => (
          <li key={template.id} className="rounded-md border border-line px-3 py-2 text-body-sm">
            <span className="font-medium" dir="auto">
              {template.name}
            </span>{' '}
            <span className="text-ink-3">
              {formatLocalDate(template.nextRunOn ?? today, locale, {
                day: 'numeric',
                month: 'short',
              })}
            </span>{' '}
            <Amount
              minor={template.type === 'expense' ? -template.amountMinor : template.amountMinor}
              currency={template.currency}
              sign="always"
              tone={template.type === 'income' ? 'income' : 'ink'}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
