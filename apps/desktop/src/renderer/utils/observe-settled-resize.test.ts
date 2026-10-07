import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { observeSettledResize } from './observe-settled-resize';

const target = {} as Element;
let fireResize: () => void = () => {};
const disconnect = vi.fn();

class FakeResizeObserver {
  constructor(callback: () => void) {
    fireResize = callback;
  }
  observe(): void {}
  disconnect(): void {
    disconnect();
  }
}

describe('observeSettledResize', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    disconnect.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports once after a burst of resizes settles', () => {
    const onSettled = vi.fn();
    observeSettledResize(target, onSettled, 100);
    for (let frame = 0; frame < 18; frame++) {
      fireResize();
      vi.advanceTimersByTime(16);
    }
    expect(onSettled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('stops observing and drops a pending report when disposed', () => {
    const onSettled = vi.fn();
    const stop = observeSettledResize(target, onSettled, 100);
    fireResize();
    stop();
    vi.advanceTimersByTime(200);
    expect(onSettled).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
