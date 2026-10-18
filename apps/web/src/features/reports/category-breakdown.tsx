import type { CategoryType, ReportCategoryBreakdown } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { Amount } from '@/components/domain/amount';
import { CategoryChip } from '@/components/domain/category-chip';
import { Segmented } from '@/components/ui/segmented';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';

const VIEW_OPTIONS = [
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
] as const;

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
] as const;

/** Whole percent; under one percent reads "<1%" (ui-design 8.5). The table keeps two decimals. */
export function percentText(percentage: number): string {
  if (percentage > 0 && percentage < 1) return '<1%';
  return `${Math.round(percentage)}%`;
}

function Bar({ percentage, other = false }: { percentage: number; other?: boolean }) {
  const width = Math.max(percentage > 0 ? 1 : 0, Math.min(percentage, 100));
  return (
    <svg aria-hidden="true" width="100%" height="10" className="block">
      <rect width="100%" height="10" rx="2" className="fill-sunken" />
      <rect
        width={`${width}%`}
        height="10"
        rx="2"
        className={other ? 'fill-series-other' : 'fill-(--cat)'}
      />
    </svg>
  );
}

function Figures({
  minor,
  currency,
  percentage,
}: {
  minor: number;
  currency: string;
  percentage: number;
}) {
  return (
    <span className="tabular flex shrink-0 items-baseline gap-2 text-body-sm">
      <Amount minor={minor} currency={currency} />
      <span className="w-10 text-right text-ink-2">{percentText(percentage)}</span>
    </span>
  );
}

export interface CategoryBreakdownProps {
  data: ReportCategoryBreakdown;
  type: CategoryType;
  onTypeChange?: (type: CategoryType) => void;
  title?: string;
  /** Rows link to the transaction list for the same range, category and type. */
  link?: boolean;
  emptyAction?: ReactNode;
}

type Item = ReportCategoryBreakdown['items'][number];

function Rows({
  data,
  type,
  link,
}: {
  data: ReportCategoryBreakdown;
  type: CategoryType;
  link: boolean;
}) {
  const { locale } = usePreferences();
  const money = (minor: number) => formatMinor(minor, data.currency, locale);
  const content = (item: Item) => (
    <>
      <div className="flex items-center justify-between gap-3">
        <CategoryChip
          icon={item.category.icon}
          color={item.category.color}
          name={item.category.name}
          retired={item.category.retired}
        />
        <Figures minor={item.amountMinor} currency={data.currency} percentage={item.percentage} />
      </div>
      <Bar percentage={item.percentage} />
    </>
  );
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {data.items.map((item) => (
        <li key={item.category.id} data-cat-color={item.category.color}>
          {link ? (
            <Link
              to="/transactions"
              search={{ category: [item.category.id], type: [type], from: data.from, to: data.to }}
              aria-label={`${item.category.name}, ${money(item.amountMinor)}, ${percentText(
                item.percentage,
              )}. Show transactions`}
              className="flex flex-col gap-1 rounded-sm p-1 hover:bg-sunken"
            >
              {content(item)}
            </Link>
          ) : (
            <div className="flex flex-col gap-1 p-1">{content(item)}</div>
          )}
        </li>
      ))}
      {data.other ? (
        <li className="flex flex-col gap-1 p-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body-sm text-ink">
              Other ({data.other.categoryCount}{' '}
              {data.other.categoryCount === 1 ? 'category' : 'categories'})
            </span>
            <Figures
              minor={data.other.amountMinor}
              currency={data.currency}
              percentage={data.other.percentage}
            />
          </div>
          <Bar percentage={data.other.percentage} other />
        </li>
      ) : null}
    </ul>
  );
}

function BreakdownTable({
  data,
  title,
  word,
}: {
  data: ReportCategoryBreakdown;
  title: string;
  word: string;
}) {
  const cell = 'py-2 pr-3 text-right';
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">
          {title}: {word} by category, {data.currency}
        </caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-2">
            <th scope="col" className="py-2 pr-3 font-medium">
              Category
            </th>
            <th scope="col" className={`${cell} font-medium`}>
              Amount
            </th>
            <th scope="col" className={`${cell} font-medium`}>
              Share
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Transactions
            </th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.category.id} className="border-b border-line">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {item.category.name}
              </th>
              <td className={cell}>
                <Amount minor={item.amountMinor} currency={data.currency} />
              </td>
              <td className={`${cell} tabular`}>{item.percentage.toFixed(2)}%</td>
              <td className="tabular py-2 text-right">{item.transactionCount}</td>
            </tr>
          ))}
          {data.other ? (
            <tr className="border-b border-line">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                Other ({data.other.categoryCount})
              </th>
              <td className={cell}>
                <Amount minor={data.other.amountMinor} currency={data.currency} />
              </td>
              <td className={`${cell} tabular`}>{data.other.percentage.toFixed(2)}%</td>
              <td className="py-2 text-right text-ink-3">-</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ranked horizontal bars (ui-design 8.5) with a Chart | Table switch. The percentages are the
 * API's, which already add up to exactly 100.00.
 */
export function CategoryBreakdown({
  data,
  type,
  onTypeChange,
  title = 'Where it went',
  link = true,
  emptyAction,
}: CategoryBreakdownProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const word = type === 'expense' ? 'expenses' : 'income';
  return (
    <div data-testid="category-breakdown">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-heading">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {onTypeChange ? (
            <Segmented
              legend="Breakdown of"
              options={TYPE_OPTIONS}
              value={type}
              onChange={onTypeChange}
            />
          ) : null}
          <Segmented
            legend="Breakdown view"
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
          />
        </div>
      </div>
      {data.totalMinor === 0 ? (
        <div className="flex flex-col items-start gap-2 py-4">
          <p className="text-body text-ink-2">No {word} in this range.</p>
          {emptyAction}
        </div>
      ) : (
        <>
          {view === 'chart' ? (
            <Rows data={data} type={type} link={link} />
          ) : (
            <BreakdownTable data={data} title={title} word={word} />
          )}
          <p className="mt-3 text-body-sm text-ink-2">
            Total <Amount minor={data.totalMinor} currency={data.currency} />. Transfers excluded.
          </p>
        </>
      )}
    </div>
  );
}
