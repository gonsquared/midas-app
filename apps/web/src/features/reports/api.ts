import type {
  CategoryType,
  ReportCategoryBreakdown,
  ReportSummary,
  ReportTrend,
  TrendGroupBy,
} from '@midas/shared';
import {
  ReportCategoryBreakdownSchema,
  ReportSummarySchema,
  ReportTrendSchema,
} from '@midas/shared/reports';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { DateRange } from '@/lib/dates';

export const REPORTS_KEY = ['reports'] as const;

export function useReportSummary(range: DateRange) {
  return useQuery({
    queryKey: [...REPORTS_KEY, 'summary', range.from, range.to],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }): Promise<ReportSummary> =>
      api.request('/reports/summary', {
        query: { from: range.from, to: range.to },
        parser: ReportSummarySchema,
        signal,
      }),
  });
}

export interface TrendParams {
  range: DateRange;
  /** Waits for a currency: totals are never mixed, and the server default may not match. */
  currency: string | undefined;
  groupBy?: TrendGroupBy | undefined;
}

export function useReportTrend({ range, currency, groupBy }: TrendParams) {
  return useQuery<ReportTrend>({
    enabled: Boolean(currency),
    queryKey: [...REPORTS_KEY, 'trend', range.from, range.to, currency, groupBy ?? 'auto'],
    placeholderData: (previous) => (previous?.currency === currency ? previous : undefined),
    queryFn: ({ signal }) =>
      api.request('/reports/trend', {
        query: {
          from: range.from,
          to: range.to,
          ...(currency ? { currency } : {}),
          ...(groupBy ? { groupBy } : {}),
        },
        parser: ReportTrendSchema,
        signal,
      }),
  });
}

export interface BreakdownParams {
  range: DateRange;
  currency: string | undefined;
  type: CategoryType;
}

export function useCategoryBreakdown({ range, currency, type }: BreakdownParams) {
  return useQuery<ReportCategoryBreakdown>({
    enabled: Boolean(currency),
    queryKey: [...REPORTS_KEY, 'breakdown', range.from, range.to, currency, type],
    placeholderData: (previous) => (previous?.currency === currency ? previous : undefined),
    queryFn: ({ signal }) =>
      api.request('/reports/category-breakdown', {
        query: {
          from: range.from,
          to: range.to,
          type,
          ...(currency ? { currency } : {}),
        },
        parser: ReportCategoryBreakdownSchema,
        signal,
      }),
  });
}
