import type { RecurringTemplate } from '@midas/shared';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { CircleCheck, Flag, MoreHorizontal, Pause } from 'lucide-react';
import { menuContentClass, menuItemClass } from '@/app/shell/add-menu';
import { Amount } from '@/components/domain/amount';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { formatLocalDate } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { scheduleText } from './schedule';

export interface TemplateActions {
  onEdit: (template: RecurringTemplate) => void;
  onPause: (template: RecurringTemplate) => void;
  onResume: (template: RecurringTemplate) => void;
  onDelete: (template: RecurringTemplate) => void;
  onHistory: (template: RecurringTemplate) => void;
  /** Template ids with a pause/resume request in flight. */
  busy?: ReadonlySet<string>;
}

const STATUS = {
  active: { label: 'Active', Icon: CircleCheck },
  paused: { label: 'Paused', Icon: Pause },
  ended: { label: 'Ended', Icon: Flag },
} as const;

function RowMenu({ t, actions }: { t: RecurringTemplate; actions: TemplateActions }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <IconButton
          label={`Actions for ${t.name}`}
          data-row-actions="true"
          size="sm"
          className="pointer-coarse:size-11"
          icon={<MoreHorizontal className="size-4" />}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={menuContentClass}>
          {t.status !== 'ended' ? (
            <Menu.Item className={menuItemClass} onSelect={() => actions.onEdit(t)}>
              Edit
            </Menu.Item>
          ) : null}
          <Menu.Item className={menuItemClass} onSelect={() => actions.onHistory(t)}>
            Run history
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item
            className={`${menuItemClass} text-danger`}
            onSelect={() => actions.onDelete(t)}
          >
            Delete
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function RecurringTable({
  templates,
  actions,
}: {
  templates: readonly RecurringTemplate[];
  actions: TemplateActions;
}) {
  const { locale } = usePreferences();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">Recurring transactions</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-2">
            {['Name', 'Schedule', 'Next', 'Amount', 'Wallet', 'Status'].map((h) => (
              <th key={h} scope="col" className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => {
            const { label, Icon } = STATUS[t.status];
            return (
              <tr
                key={t.id}
                data-recurring-row={t.id}
                className={`border-b border-line ${t.status === 'active' ? '' : 'text-ink-2'}`}
              >
                <th scope="row" className="py-2 pr-3 text-left font-medium" dir="auto">
                  {t.name}
                </th>
                <td className="py-2 pr-3">{scheduleText(t, locale)}</td>
                <td className="py-2 pr-3">
                  {t.nextRunOn
                    ? formatLocalDate(t.nextRunOn, locale, { day: 'numeric', month: 'short' })
                    : '-'}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Amount
                    minor={t.type === 'expense' ? -t.amountMinor : t.amountMinor}
                    currency={t.currency}
                    sign="always"
                    tone={t.type === 'income' ? 'income' : 'ink'}
                  />
                </td>
                <td className="py-2 pr-3">{t.wallet.name}</td>
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-1">
                    <Icon aria-hidden="true" className="size-4" />
                    {label}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-1">
                    {t.status === 'active' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={actions.busy?.has(t.id) ?? false}
                        onClick={() => actions.onPause(t)}
                      >
                        Pause <span className="sr-only">{t.name}</span>
                      </Button>
                    ) : null}
                    {t.status === 'paused' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={actions.busy?.has(t.id) ?? false}
                        onClick={() => actions.onResume(t)}
                      >
                        Resume <span className="sr-only">{t.name}</span>
                      </Button>
                    ) : null}
                    <RowMenu t={t} actions={actions} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
