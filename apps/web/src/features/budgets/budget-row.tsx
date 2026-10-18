import type { Budget } from '@midas/shared';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { menuContentClass, menuItemClass } from '@/app/shell/add-menu';
import { BudgetMeter, BudgetStateBadge } from '@/components/domain/budget-meter';
import { CategoryChip } from '@/components/domain/category-chip';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import { budgetName, paceOf, rowPeriodLabel, PERIOD_LABELS } from './budget-state';

export interface BudgetActions {
  onEdit: (budget: Budget) => void;
  onDelete: (budget: Budget) => void;
}

function RowMenu({ budget, actions }: { budget: Budget; actions: BudgetActions }) {
  const name = budgetName(budget);
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <IconButton
          label={`Actions for ${name} budget`}
          size="sm"
          className="pointer-coarse:size-11"
          icon={<MoreHorizontal className="size-4" />}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={menuContentClass}>
          <Menu.Item className={menuItemClass} onSelect={() => actions.onEdit(budget)}>
            Edit budget
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item
            className={`${menuItemClass} text-danger`}
            onSelect={() => actions.onDelete(budget)}
          >
            Delete budget
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export interface BudgetRowProps {
  budget: Budget;
  today: string;
  actions: BudgetActions;
  highlighted?: boolean;
}

export function BudgetRow({ budget, today, actions, highlighted = false }: BudgetRowProps) {
  const { locale } = usePreferences();
  const overall = budget.scope === 'overall';
  const name = budgetName(budget);
  const { status } = budget;
  const pace = paceOf(status, today);
  const money = (minor: number) => formatMinor(minor, budget.currency, locale);
  const caption = status
    ? status.state === 'exceeded' || status.remainingMinor < 0
      ? `${money(status.spentMinor)} spent of ${money(budget.amountMinor)} limit`
      : `${money(status.spentMinor)} of ${money(budget.amountMinor)} - ${money(status.remainingMinor)} left`
    : `${money(budget.amountMinor)} limit`;
  return (
    <li
      data-budget-row={budget.id}
      className={cn(
        'flex flex-col gap-2 border-t border-line px-1 py-3 first:border-t-0',
        highlighted && 'bg-primary-tint',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {overall || !budget.category ? (
            <span className="font-medium text-ink">Overall</span>
          ) : (
            <CategoryChip
              icon={budget.category.icon}
              color={budget.category.color}
              name={budget.category.name}
              retired={budget.category.retired}
            />
          )}
          <span className="text-caption text-ink-3">
            {PERIOD_LABELS[budget.period]} - {rowPeriodLabel(budget, locale)}
            {overall && budget.currency ? ` - ${budget.currency}` : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BudgetStateBadge budget={budget} />
          <RowMenu budget={budget} actions={actions} />
        </div>
      </div>
      <BudgetMeter budget={budget} pace={pace} tall={overall} label={`${name} budget`} />
      <p className="tabular text-body-sm text-ink-2">
        {caption}
        {pace ? ` - ${pace.daysToGo} day${pace.daysToGo === 1 ? '' : 's'} to go` : ''}
      </p>
    </li>
  );
}
