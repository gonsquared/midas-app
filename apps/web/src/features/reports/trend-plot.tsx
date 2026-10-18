import type { ReportTrend } from '@midas/shared';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { axisLabel, compactMoney, MAX_COLUMN_BUCKETS } from './trend-format';

export interface TrendPlotProps {
  trend: ReportTrend;
  locale: string;
  width: number;
  height: number;
  /** Index of the bucket shown in the readout, or null. */
  active: number | null;
  onActive: (index: number | null) => void;
}

const INCOME = 'var(--color-series-income)';
const EXPENSE = 'var(--color-series-expense)';
const NET = 'var(--color-series-net)';
const AXIS_TEXT = { fill: 'var(--color-ink-2)', fontSize: 12 } as const;

/**
 * The Recharts drawing. Recharts renders SVG elements with presentation attributes and writes no
 * <style> element; animation is off, so marks appear in their final state (also reduced motion).
 * The wrapper in trend-chart.tsx makes it accessible: this plot is hidden from assistive tech and
 * the keyboard readout and table carry the same data.
 */
export default function TrendPlot({
  trend,
  locale,
  width,
  height,
  active,
  onActive,
}: TrendPlotProps) {
  const data = trend.buckets.map((bucket, index) => ({
    index,
    label: `${axisLabel(bucket, trend, locale)}#${index}`,
    short: axisLabel(bucket, trend, locale),
    income: bucket.incomeMinor,
    expense: bucket.expenseMinor,
    net: bucket.netMinor,
  }));
  const columns = data.length <= MAX_COLUMN_BUCKETS;
  const activeLabel = active !== null ? data[active]?.label : undefined;
  const tickEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(width / 64))));

  return (
    <ComposedChart
      width={width}
      height={height}
      data={data}
      margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
      accessibilityLayer={false}
      onMouseMove={(state) => {
        const index = Number(state?.activeTooltipIndex);
        onActive(Number.isInteger(index) && index >= 0 ? index : null);
      }}
      onMouseLeave={() => onActive(null)}
    >
      <CartesianGrid vertical={false} stroke="var(--color-grid)" strokeWidth={1} />
      {activeLabel ? (
        <ReferenceArea
          x1={activeLabel}
          x2={activeLabel}
          fill="var(--color-sunken)"
          fillOpacity={0.6}
        />
      ) : null}
      <XAxis
        dataKey="label"
        tickFormatter={(value: string) => value.slice(0, value.lastIndexOf('#'))}
        interval={tickEvery - 1}
        tickLine={false}
        axisLine={{ stroke: 'var(--color-axis)' }}
        tick={AXIS_TEXT}
      />
      <YAxis
        width={56}
        tickLine={false}
        axisLine={false}
        tick={AXIS_TEXT}
        tickFormatter={(value: number) => compactMoney(value, trend.currency, locale)}
      />
      <ReferenceLine y={0} stroke="var(--color-axis)" strokeWidth={1} />
      <Tooltip content={() => null} cursor={false} />
      {columns ? (
        <>
          <Bar
            dataKey="income"
            fill={INCOME}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expense"
            fill={EXPENSE}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </>
      ) : (
        <>
          <Line
            dataKey="income"
            stroke={INCOME}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            type="linear"
          />
          <Line
            dataKey="expense"
            stroke={EXPENSE}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            type="linear"
          />
        </>
      )}
      <Line
        dataKey="net"
        stroke={NET}
        strokeWidth={2}
        strokeLinejoin="round"
        dot={data.length <= MAX_COLUMN_BUCKETS ? { r: 4, strokeWidth: 2, fill: NET } : false}
        isAnimationActive={false}
        type="linear"
      />
    </ComposedChart>
  );
}
