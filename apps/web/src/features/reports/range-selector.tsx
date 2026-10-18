import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DateField } from '@/components/domain/date-field';
import { Button } from '@/components/ui/button';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { IconButton } from '@/components/ui/icon-button';
import { datePresets, rangeLengthDays, type DateRange } from '@/lib/dates';
import {
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  REPORT_MAX_RANGE_DAYS,
  canStepMonth,
  isRangePreset,
  rangeLabel,
  stepMonth,
  type RangePreset,
} from './range';

export interface RangeSelectorProps {
  range: DateRange;
  kind: RangePreset | 'custom';
  locale: string;
  today: string;
  /** Called with a concrete range; the page decides how to write it to the URL. */
  onChange: (range: DateRange, preset?: RangePreset) => void;
}

/** Why a custom range cannot be applied, or null (ui-design 5.10: at most 1830 days). */
export function customRangeError(from: string, to: string): string | null {
  if (!from || !to) return 'Choose both a start and an end date.';
  if (to < from) return 'The end date must not be before the start date.';
  if (rangeLengthDays({ from, to }) > REPORT_MAX_RANGE_DAYS) {
    return 'Choose a range of up to 5 years (1,830 days).';
  }
  return null;
}

/**
 * Preset menu plus a custom range, with previous and next arrows for whole months (E7-F2-S4).
 * A native select keeps it CSP-safe; the page owns the URL state.
 */
export function RangeSelector({ range, kind, locale, today, onChange }: RangeSelectorProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(range);
  const [error, setError] = useState<string | null>(null);
  const stepping = canStepMonth(range);
  const showCustom = customOpen;

  const options = [
    ...RANGE_PRESETS.map((value) => ({ value, label: RANGE_PRESET_LABELS[value] })),
    {
      value: 'custom',
      label: kind === 'custom' ? `Custom: ${rangeLabel(range, locale)}` : 'Custom range',
    },
  ];

  const pick = (value: string) => {
    if (isRangePreset(value)) {
      setCustomOpen(false);
      setError(null);
      onChange(datePresets(today)[value], value);
    } else {
      setDraft(range);
      setCustomOpen(true);
    }
  };

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const problem = customRangeError(draft.from, draft.to);
    setError(problem);
    if (problem) return;
    setCustomOpen(false);
    onChange(draft);
  };

  return (
    <div role="group" aria-label="Date range" className="flex flex-wrap items-end gap-3">
      <div className="flex items-end gap-1">
        {stepping ? (
          <IconButton
            label="Previous month"
            icon={<ChevronLeft className="size-4" />}
            onClick={() => onChange(stepMonth(range, -1))}
          />
        ) : null}
        <FieldFrame label="Range" id="range-select">
          {(control) => (
            <NativeSelect
              {...control}
              className="min-w-44"
              value={showCustom || kind === 'custom' ? 'custom' : kind}
              onChange={pick}
              options={options}
            />
          )}
        </FieldFrame>
        {stepping ? (
          <IconButton
            label="Next month"
            icon={<ChevronRight className="size-4" />}
            onClick={() => onChange(stepMonth(range, 1))}
          />
        ) : null}
      </div>
      <p
        data-testid="range-label"
        aria-live="polite"
        className="pb-2 font-display text-subheading font-semibold"
      >
        {rangeLabel(range, locale)}
      </p>
      {showCustom ? (
        <form
          noValidate
          onSubmit={apply}
          aria-label="Custom range"
          className="flex w-full flex-wrap items-start gap-3"
        >
          <FieldFrame label="From" id="range-from" error={error ?? undefined}>
            {(control) => (
              <DateField
                {...control}
                value={draft.from}
                onChange={(from) => setDraft((d) => ({ ...d, from }))}
              />
            )}
          </FieldFrame>
          <FieldFrame label="To" id="range-to">
            {(control) => (
              <DateField
                {...control}
                aria-invalid={undefined}
                value={draft.to}
                today={today}
                onChange={(to) => setDraft((d) => ({ ...d, to }))}
              />
            )}
          </FieldFrame>
          <Button type="submit" className="mt-6">
            Apply range
          </Button>
        </form>
      ) : null}
    </div>
  );
}
