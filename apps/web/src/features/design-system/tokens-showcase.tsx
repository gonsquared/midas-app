import { cn } from '@/lib/cn';

// Class names are literal so Tailwind can see them. Each swatch is a token, never a raw hex.
const SWATCHES: ReadonlyArray<{ group: string; items: ReadonlyArray<[string, string]> }> = [
  {
    group: 'Surfaces and lines',
    items: [
      ['canvas', 'bg-canvas'],
      ['surface', 'bg-surface'],
      ['raised', 'bg-raised'],
      ['sunken', 'bg-sunken'],
      ['line', 'bg-line'],
      ['line-strong', 'bg-line-strong'],
    ],
  },
  {
    group: 'Text',
    items: [
      ['ink', 'bg-ink'],
      ['ink-2', 'bg-ink-2'],
      ['ink-3', 'bg-ink-3'],
    ],
  },
  {
    group: 'Brand and accent',
    items: [
      ['primary', 'bg-primary'],
      ['primary-hover', 'bg-primary-hover'],
      ['primary-tint', 'bg-primary-tint'],
      ['brass', 'bg-brass'],
    ],
  },
  {
    group: 'Semantic',
    items: [
      ['income', 'bg-income'],
      ['danger', 'bg-danger'],
      ['warning', 'bg-warning'],
      ['warning-mark', 'bg-warning-mark'],
      ['info', 'bg-info'],
    ],
  },
  {
    group: 'Chart',
    items: [
      ['series-income', 'bg-series-income'],
      ['series-expense', 'bg-series-expense'],
      ['series-net', 'bg-series-net'],
      ['series-other', 'bg-series-other'],
      ['grid', 'bg-grid'],
      ['axis', 'bg-axis'],
    ],
  },
];

export function ColorSwatches() {
  return (
    <div className="flex flex-col gap-6">
      {SWATCHES.map((group) => (
        <div key={group.group}>
          <h3 className="mb-2 text-subheading font-semibold">{group.group}</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {group.items.map(([name, swatchClass]) => (
              <li key={name} className="flex flex-col gap-1">
                <span
                  aria-hidden="true"
                  className={cn('h-12 rounded-sm border border-line', swatchClass)}
                />
                <code className="font-mono text-mono text-ink-2">{name}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const TYPE_SCALE: ReadonlyArray<[string, string, string]> = [
  ['figure-hero', 'font-display text-figure-hero font-semibold', '12,480.00'],
  ['figure-lg', 'font-display text-figure-lg font-semibold', '3,204.50'],
  ['title', 'font-display text-title font-semibold', 'Page title'],
  ['heading', 'font-display text-heading font-semibold', 'Section heading'],
  ['subheading', 'text-subheading font-semibold', 'Panel title'],
  ['body', 'text-body', 'Body text in IBM Plex Sans, at most 70 characters per line.'],
  ['body-sm', 'text-body-sm', 'Tables, dense lists and helper text.'],
  ['caption', 'text-caption', 'Caption, never the only place essential information appears.'],
  ['mono', 'font-mono text-mono', 'req_8f3a21c0 (identifiers only)'],
];

export function TypeScale() {
  return (
    <dl className="flex flex-col divide-y divide-line border-y border-line">
      {TYPE_SCALE.map(([name, classes, sample]) => (
        <div key={name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6">
          <dt className="w-32 shrink-0 text-body-sm text-ink-3">{name}</dt>
          <dd className={cn('tabular', classes)}>{sample}</dd>
        </div>
      ))}
    </dl>
  );
}
