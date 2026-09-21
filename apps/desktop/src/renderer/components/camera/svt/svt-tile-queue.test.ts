import { describe, it, expect } from 'vitest';
import { acquireTileSlot, releaseTileSlot } from './svt-tile-queue';

const CAP = 8;

/** Tracks how many holders are in flight at once, the thing the cap governs. */
function tracker() {
  let inFlight = 0;
  let peak = 0;
  const pending: Promise<void>[] = [];
  return {
    take() {
      pending.push(acquireTileSlot().then(() => {
        inFlight++;
        peak = Math.max(peak, inFlight);
      }));
    },
    release() {
      inFlight--;
      releaseTileSlot();
    },
    settle: () => Promise.resolve().then(() => Promise.resolve()),
    drain: () => Promise.all(pending),
    get peak() { return peak; },
    get inFlight() { return inFlight; },
  };
}

describe('tile slot limiter', () => {
  it('admits up to the cap and queues the rest', async () => {
    const t = tracker();
    for (let i = 0; i < CAP + 3; i++) t.take();
    await t.settle();
    expect(t.inFlight).toBe(CAP);

    for (let i = 0; i < CAP + 3; i++) { t.release(); await t.settle(); }
    await t.drain();
    expect(t.peak).toBe(CAP);
  });

  // A release used to free the slot and let the woken waiter re-take it a
  // microtask later; a caller arriving in that window slipped past the cap.
  it('holds the cap when a caller arrives during a release', async () => {
    const t = tracker();
    for (let i = 0; i < CAP + 1; i++) t.take();
    await t.settle();
    expect(t.inFlight).toBe(CAP);

    t.release();
    t.take(); // synchronous arrival, before the woken waiter runs
    await t.settle();
    expect(t.peak).toBe(CAP);

    while (t.inFlight > 0) { t.release(); await t.settle(); }
    await t.drain();
    expect(t.peak).toBe(CAP);
  });
});
