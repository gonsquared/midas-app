import { describe, expect, it } from 'vitest';
import { MetricsRegistry } from './metrics.js';

describe('MetricsRegistry', () => {
  it('renders counters, histograms and gauges in Prometheus text format', () => {
    const metrics = new MetricsRegistry();
    metrics.httpRequests.inc({ method: 'GET', route: '/health', status: '200' });
    metrics.httpRequests.inc({ method: 'GET', route: '/health', status: '200' });
    metrics.httpDuration.observe({ method: 'GET', route: '/health' }, 0.02);
    metrics.setPoolStats(() => ({ total: 4, idle: 3, waiting: 0 }));
    const text = metrics.render();
    expect(text).toContain('# TYPE midas_http_requests_total counter');
    expect(text).toContain(
      'midas_http_requests_total{method="GET",route="/health",status="200"} 2',
    );
    expect(text).toContain(
      'midas_http_request_duration_seconds_bucket{method="GET",route="/health",le="0.025"} 1',
    );
    expect(text).toContain(
      'midas_http_request_duration_seconds_bucket{method="GET",route="/health",le="0.01"} 0',
    );
    expect(text).toContain(
      'midas_http_request_duration_seconds_count{method="GET",route="/health"} 1',
    );
    expect(text).toContain('midas_db_pool_connections{state="idle"} 3');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('escapes quotes, newlines and backslashes in label values', () => {
    const metrics = new MetricsRegistry();
    metrics.schedulerRuns.inc({ task: 'a"b\nc\\d', result: 'ok' });
    expect(metrics.render()).toContain(String.raw`task="a\"b\nc\\d"`);
  });
});
