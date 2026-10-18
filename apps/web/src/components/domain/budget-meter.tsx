import type { Budget } from '@midas/shared';
import { CircleCheck, OctagonX, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { formatLocalDate } from '@/lib/dates';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import {
  displayPercent,
  PERIOD_LABELS,
  stateLabel,
  type Pace,
} from '@/features/budgets/budget-state';

const STATE_STYLES = {
  ok: { fill: 'fill-income', track: 'fill-income/15', text: 'text-income', tint: '' },
  warning: {
    fill: 'fill-warning-mark',
    track: 'fill-warning-mark/20',
    text: 'text-warning',
    tint: 'bg-warning-tint',
  },
  exceeded: {
    fill: 'fill-danger',
    track: 'fill-danger/15',
    text: 'text-danger',
    tint: 'bg-danger-tint',
  },
} as const;

/** Icon plus words for the state; the color only reinforces it (ui-design 6.7, 6.9). */
export function BudgetStateBadge({ budget, className }: { budget: Budget; className?: string }) {
  const { locale } = usePreferences();
  const state = budget.status?.state ?? 'ok';
  const styles = STATE_STYLES[state];
  const Icon = state === 'exceeded' ? OctagonX : state === 'warning' ? TriangleAlert : CircleCheck;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-medium',
        budget.status ? styles.text : 'text-ink-2',
        budget.status ? styles.tint : 'bg-sunken',
        className,
      )}
    >
      {budget.status ? <Icon aria-hidden="true" className="size-3.5" /> : null}
      {stateLabel(budget, locale)}
    </span>
  );
}

export interface BudgetMeterProps {
  budget: Budget;
  /** Elapsed share of the period; the brass notch is drawn only when given. */
  pace?: Pace | null;
  /** The Overall budget gets the taller meter. */
  tall?: boolean;
  /** Accessible name, for example "Groceries budget". */
  label: string;
  className?: string;
}

const HATCH_ANGLE = 'rotate(45)';

/**
 * Budget meter (ui-design 8.4): an SVG with role="meter". Geometry uses SVG attributes only, so no
 * inline style is written. Past 100% the overflow is a hatched continuation, never color alone.
 */
export function BudgetMeter({ budget, pace, tall = false, label, className }: BudgetMeterProps) {
  const { locale } = usePreferences();
  const patternId = useId();
  const { status } = budget;
  // The same category can have a weekly and a monthly budget, in different currencies.
  const name = `${label}, ${PERIOD_LABELS[budget.period].toLowerCase()}, ${budget.currency}`;
  const trackHeight = tall ? 12 : 8;
  const height = tall ? 20 : 16;
  const y = (height - trackHeight) / 2;

  if (!status) {
    return (
      <svg
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={budget.amountMinor}
        aria-valuenow={0}
        aria-valuetext={`Starts ${formatLocalDate(budget.startDate, locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}, nothing spent yet`}
        width="100%"
        height={height}
        className={cn('block overflow-visible', className)}
      >
        <rect y={y} width="100%" height={trackHeight} rx="4" className="fill-sunken" />
      </svg>
    );
  }

  const percent = status.percentUsed;
  const scale = Math.max(percent, 100);
  const solid = Math.min(percent, 100);
  const solidWidth = (solid / scale) * 100;
  const styles = STATE_STYLES[status.state];
  const valuetext = `${formatMinor(status.spentMinor, budget.currency, locale)} of ${formatMinor(
    budget.amountMinor,
    budget.currency,
    locale,
  )}, ${displayPercent(status)} percent, ${stateLabel(budget, locale).toLowerCase()}`;
  const paceX = pace ? Math.min(Math.max(pace.fraction, 0), 1) * 100 : null;

  return (
    <svg
      role="meter"
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={budget.amountMinor}
      aria-valuenow={Math.min(status.spentMinor, budget.amountMinor)}
      aria-valuetext={valuetext}
      width="100%"
      height={height}
      className={cn('block overflow-visible', className)}
    >
      <defs>
        <pattern
          id={patternId}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform={HATCH_ANGLE}
        >
          <rect width="6" height="6" className="fill-danger/25" />
          <rect width="3" height="6" className="fill-danger" />
        </pattern>
      </defs>
      <rect y={y} width="100%" height={trackHeight} rx="4" className={styles.track} />
      <rect y={y} width={`${solidWidth}%`} height={trackHeight} rx="4" className={styles.fill} />
      {percent > 100 ? (
        <rect
          data-testid="budget-overflow"
          x={`${solidWidth}%`}
          y={y}
          width={`${100 - solidWidth}%`}
          height={trackHeight}
          fill={`url(#${patternId})`}
        />
      ) : null}
      {paceX !== null ? (
        <rect
          data-testid="budget-pace"
          aria-hidden="true"
          x={`${paceX}%`}
          width="2"
          height={height}
          className="fill-brass"
        />
      ) : null}
    </svg>
  );
}
