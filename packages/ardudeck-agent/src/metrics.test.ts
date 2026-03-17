// metrics.test.ts
import { describe, it, expect } from 'vitest';
import { collectMetrics } from './metrics';

describe('metrics', () => {
  it('returns valid MetricsData shape', async () => {
    const m = await collectMetrics();
    expect(m.cpu).toBeGreaterThanOrEqual(0);
    expect(m.cpu).toBeLessThanOrEqual(100);
    expect(m.ram).toBeGreaterThanOrEqual(0);
    expect(m.ram).toBeLessThanOrEqual(100);
    expect(m.ramTotal).toBeGreaterThan(0);
    expect(m.disk).toBeGreaterThanOrEqual(0);
    expect(m.diskTotal).toBeGreaterThan(0);
    expect(typeof m.temp).toBe('number');
  });
});
