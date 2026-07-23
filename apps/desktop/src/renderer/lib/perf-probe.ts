/**
 * TEMPORARY performance probe - diagnosing the in-flight telemetry freeze.
 *
 * Emits a `[PERF]` summary line to the console every 2s:
 *   - fps                : rAF frame rate (drops toward ~1 when the main thread is saturated)
 *   - pkt.rx             : raw MAVLink packets/sec reaching this renderer via onPacket
 *   - inspector / safety : per-packet decoder cost (calls/sec and ms/sec spent)
 *   - longtasks          : main-thread blocks >50ms in the window (count, total ms, max)
 *   - heap               : JS heap MB (to spot growth)
 *
 * If `ms/sec` for a decoder approaches ~2000 (i.e. it's eating a whole 2s
 * window), that decoder is the freeze. REMOVE this file + its call sites once
 * the cause is confirmed.
 */

interface Acc { count: number; ms: number }
const acc: Record<string, Acc> = {};

/** Count one occurrence of `label` (e.g. a packet received). */
export function probeCount(label: string): void {
  (acc[label] ??= { count: 0, ms: 0 }).count++;
}

/** Run `fn`, attributing its wall-clock time (and one call) to `label`. */
export function probeTime<T>(label: string, fn: () => T): T {
  const a = (acc[label] ??= { count: 0, ms: 0 });
  const t = performance.now();
  try {
    return fn();
  } finally {
    a.count++;
    a.ms += performance.now() - t;
  }
}

let started = false;

export function startPerfProbe(tag = ''): void {
  if (started) return;
  started = true;

  let frames = 0;
  const onFrame = () => { frames++; requestAnimationFrame(onFrame); };
  requestAnimationFrame(onFrame);

  let ltCount = 0;
  let ltMs = 0;
  let ltMax = 0;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        ltCount++;
        ltMs += e.duration;
        if (e.duration > ltMax) ltMax = e.duration;
      }
    });
    po.observe({ entryTypes: ['longtask'] });
  } catch {
    /* longtask not supported in this context */
  }

  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000 || 1;
    last = now;

    const fps = (frames / dt).toFixed(1);
    frames = 0;

    const parts: string[] = [];
    for (const label of Object.keys(acc).sort()) {
      const a = acc[label]!;
      const perSec = Math.round(a.count / dt);
      parts.push(a.ms > 0 ? `${label}=${perSec}/s(${Math.round(a.ms / dt)}ms/s)` : `${label}=${perSec}/s`);
      a.count = 0;
      a.ms = 0;
    }

    const lt = ltCount ? ` | longtasks=${ltCount}(${Math.round(ltMs)}ms,max${Math.round(ltMax)})` : '';
    ltCount = 0; ltMs = 0; ltMax = 0;

    const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const heap = perfMem ? ` | heap=${Math.round(perfMem.usedJSHeapSize / 1e6)}MB` : '';

    // eslint-disable-next-line no-console
    console.log(`[PERF${tag ? ' ' + tag : ''}] fps=${fps} | ${parts.join(' | ')}${lt}${heap}`);
  }, 2000);
}
