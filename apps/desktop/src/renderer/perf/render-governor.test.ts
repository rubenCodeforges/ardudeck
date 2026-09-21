import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextLevel, createCoalescer, useRenderGovernor, FLUSH_INTERVAL_MS } from './render-governor';

describe('nextLevel', () => {
  it('holds while frames are healthy but the window is short', () => {
    expect(nextLevel('full', { slowShare: 0.5, heldMs: 500 })).toBe('full');
  });

  it('drops a level once slow frames persist', () => {
    expect(nextLevel('full', { slowShare: 0.4, heldMs: 3000 })).toBe('reduced');
    expect(nextLevel('reduced', { slowShare: 0.4, heldMs: 3000 })).toBe('minimal');
  });

  it('never drops past minimal', () => {
    expect(nextLevel('minimal', { slowShare: 0.9, heldMs: 60000 })).toBe('minimal');
  });

  it('climbs back only after a long clean stretch', () => {
    expect(nextLevel('minimal', { slowShare: 0.02, heldMs: 4000 })).toBe('minimal');
    expect(nextLevel('minimal', { slowShare: 0.02, heldMs: 10000 })).toBe('reduced');
    expect(nextLevel('reduced', { slowShare: 0.02, heldMs: 10000 })).toBe('full');
  });

  it('never climbs past full', () => {
    expect(nextLevel('full', { slowShare: 0, heldMs: 60000 })).toBe('full');
  });

  it('holds in the band between the two thresholds', () => {
    expect(nextLevel('reduced', { slowShare: 0.2, heldMs: 60000 })).toBe('reduced');
  });
});

describe('createCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useRenderGovernor.setState({ level: 'full', pinned: null, slowShare: 0, smoothConsumers: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
    useRenderGovernor.setState({ level: 'full', pinned: null, slowShare: 0, smoothConsumers: 0 });
  });

  it('passes every value straight through at full rate', () => {
    const seen: number[] = [];
    const push = createCoalescer<number>((v) => seen.push(v));
    push(1); push(2); push(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('collapses a burst to the newest value when throttled', () => {
    useRenderGovernor.setState({ level: 'reduced' });
    const seen: number[] = [];
    const push = createCoalescer<number>((v) => seen.push(v));
    push(1); push(2); push(3);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS.reduced);
    expect(seen).toEqual([3]);
  });

  it('keeps delivering across successive windows', () => {
    useRenderGovernor.setState({ level: 'minimal' });
    const seen: number[] = [];
    const push = createCoalescer<number>((v) => seen.push(v));
    push(1);
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS.minimal);
    push(2);
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS.minimal);
    expect(seen).toEqual([1, 2]);
  });

  it('passes everything through while a smooth-motion view is mounted', () => {
    // Synthetic vision flies the camera off the live position; thinning it
    // reads as the aircraft lurching backwards.
    useRenderGovernor.setState({ level: 'minimal', smoothConsumers: 1 });
    const seen: number[] = [];
    const push = createCoalescer<number>((v) => seen.push(v));
    push(1); push(2); push(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('resumes thinning once the smooth view closes', () => {
    useRenderGovernor.setState({ level: 'reduced', smoothConsumers: 0 });
    const seen: number[] = [];
    const push = createCoalescer<number>((v) => seen.push(v));
    push(1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS.reduced);
    expect(seen).toEqual([1]);
  });

  it('honours a pinned level over the measured one', () => {
    useRenderGovernor.setState({ level: 'full', pinned: 'minimal' });
    const seen: number[] = [];
    const push = createCoalescer<number>((v) => seen.push(v));
    push(1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS.minimal);
    expect(seen).toEqual([1]);
  });
});
