/**
 * Minimal Prometheus registry (architecture 2.5): counters, gauges and one histogram type, with
 * text exposition format 0.0.4. Labels are always fixed, low-cardinality strings (route patterns,
 * status codes, job names), never user input.
 */

type Labels = Record<string, string>;

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((name) => `${name}="${escapeLabel(labels[name] ?? '')}"`)
    .join(',');
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : value > 0 ? '+Inf' : '-Inf';
}

function braces(key: string, extra = ''): string {
  const inner = [key, extra].filter(Boolean).join(',');
  return inner ? `{${inner}}` : '';
}

export class Counter {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  /** Test helper. */
  get(labels: Labels = {}): number {
    return this.values.get(labelKey(labels)) ?? 0;
  }

  render(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, value] of this.values) lines.push(`${this.name}${braces(key)} ${value}`);
    return lines;
  }
}

export class Gauge {
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly collect: () => Array<{ labels?: Labels; value: number }>,
  ) {}

  render(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const sample of this.collect()) {
      lines.push(
        `${this.name}${braces(labelKey(sample.labels ?? {}))} ${formatNumber(sample.value)}`,
      );
    }
    return lines;
  }
}

export class Histogram {
  private readonly series = new Map<string, { buckets: number[]; sum: number; count: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly bounds: readonly number[],
  ) {}

  observe(labels: Labels, value: number): void {
    const key = labelKey(labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { buckets: this.bounds.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, entry);
    }
    this.bounds.forEach((bound, index) => {
      if (value <= bound) entry.buckets[index] = (entry.buckets[index] ?? 0) + 1;
    });
    entry.sum += value;
    entry.count += 1;
  }

  render(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, entry] of this.series) {
      this.bounds.forEach((bound, index) => {
        lines.push(`${this.name}_bucket${braces(key, `le="${bound}"`)} ${entry.buckets[index]}`);
      });
      lines.push(`${this.name}_bucket${braces(key, 'le="+Inf"')} ${entry.count}`);
      lines.push(`${this.name}_sum${braces(key)} ${entry.sum}`);
      lines.push(`${this.name}_count${braces(key)} ${entry.count}`);
    }
    return lines;
  }
}

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

/** Everything the app exports. One instance per process, created at boot. */
export class MetricsRegistry {
  readonly httpRequests = new Counter(
    'midas_http_requests_total',
    'HTTP requests by method, matched route and status code.',
  );
  readonly httpDuration = new Histogram(
    'midas_http_request_duration_seconds',
    'HTTP request latency by method and matched route.',
    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  );
  readonly schedulerRuns = new Counter(
    'midas_scheduler_runs_total',
    'Scheduler task runs by task and result.',
  );
  readonly recurringOccurrences = new Counter(
    'midas_recurring_occurrences_total',
    'Recurring occurrences processed by result.',
  );
  readonly auditWriteFailures = new Counter(
    'midas_audit_write_failures_total',
    'Best-effort audit writes that failed.',
  );
  private poolStats: (() => PoolStats) | undefined;
  private readonly startedAt = Date.now();

  setPoolStats(read: () => PoolStats): void {
    this.poolStats = read;
  }

  render(): string {
    const gauges: Gauge[] = [
      new Gauge('midas_process_uptime_seconds', 'Seconds since the process started.', () => [
        { value: Math.floor((Date.now() - this.startedAt) / 1000) },
      ]),
      new Gauge('midas_process_resident_memory_bytes', 'Resident set size in bytes.', () => [
        { value: process.memoryUsage().rss },
      ]),
      new Gauge('midas_db_pool_connections', 'Database pool connections by state.', () => {
        const stats = this.poolStats?.();
        if (!stats) return [];
        return [
          { labels: { state: 'total' }, value: stats.total },
          { labels: { state: 'idle' }, value: stats.idle },
          { labels: { state: 'waiting' }, value: stats.waiting },
        ];
      }),
    ];
    const lines = [
      ...this.httpRequests.render(),
      ...this.httpDuration.render(),
      ...this.schedulerRuns.render(),
      ...this.recurringOccurrences.render(),
      ...this.auditWriteFailures.render(),
      ...gauges.flatMap((gauge) => gauge.render()),
    ];
    return `${lines.join('\n')}\n`;
  }
}
