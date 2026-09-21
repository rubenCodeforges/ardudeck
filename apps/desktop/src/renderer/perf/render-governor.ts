/**
 * Keep the UI responsive on whatever machine it lands on.
 *
 * Telemetry arrives batched at 10-30 Hz and the shared store that drives the
 * map, HUD and instruments has dozens of subscribers, so every batch is a
 * render pass across most of the screen. On a desktop that is free. On a field
 * tablet with no GPU acceleration it is the whole frame budget, and the map
 * stops following the stick.
 *
 * So measure what the machine actually achieves and coalesce store updates to
 * match, instead of asking the user to find a quality setting. Nothing here
 * touches the vehicle: the link keeps its rate, the fleet store keeps every
 * sample, only the repaint is thinned.
 */

import { useEffect } from 'react';
import { create } from 'zustand';

export type RenderLevel = 'full' | 'reduced' | 'minimal';

/** Minimum gap between shared-store telemetry flushes, per level. */
export const FLUSH_INTERVAL_MS: Record<RenderLevel, number> = {
  full: 0,
  reduced: 100,
  minimal: 250,
};

export interface FrameStats {
  /** Share of recent frames that missed the budget, 0..1. */
  slowShare: number;
  /** How long the current verdict has held, in ms. */
  heldMs: number;
}

/** A frame is "slow" past this multiple of the 60 Hz budget (16.7 ms). */
const SLOW_FRAME_MS = 32;
const STEP_DOWN_SHARE = 0.3;
const STEP_UP_SHARE = 0.08;
const STEP_DOWN_AFTER_MS = 3000;
const STEP_UP_AFTER_MS = 10000;

const ORDER: RenderLevel[] = ['full', 'reduced', 'minimal'];

/**
 * Decide the next level. Pure so the hysteresis is testable without a browser:
 * dropping a level is quick (the user is suffering now), climbing back is slow
 * (so a single smooth stretch does not start it oscillating).
 */
export function nextLevel(current: RenderLevel, stats: FrameStats): RenderLevel {
  const i = ORDER.indexOf(current);
  if (stats.slowShare >= STEP_DOWN_SHARE && stats.heldMs >= STEP_DOWN_AFTER_MS) {
    return ORDER[Math.min(i + 1, ORDER.length - 1)]!;
  }
  if (stats.slowShare <= STEP_UP_SHARE && stats.heldMs >= STEP_UP_AFTER_MS) {
    return ORDER[Math.max(i - 1, 0)]!;
  }
  return current;
}

interface GovernorState {
  level: RenderLevel;
  /** Views on screen that need every sample, not a thinned one. */
  smoothConsumers: number;
  /** User override. When set, measurement is ignored. */
  pinned: RenderLevel | null;
  /** Most recent measured slow-frame share, for the settings readout. */
  slowShare: number;
  setPinned: (level: RenderLevel | null) => void;
}

const PIN_KEY = 'ardudeck:render-level';

function readPin(): RenderLevel | null {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw && ORDER.includes(raw as RenderLevel) ? (raw as RenderLevel) : null;
  } catch {
    return null;
  }
}

export const useRenderGovernor = create<GovernorState>((set) => {
  const pinned = readPin();
  return {
    level: pinned ?? 'full',
    pinned,
    smoothConsumers: 0,
    slowShare: 0,
    // A machine property, not a vehicle one, so it belongs to this install.
    setPinned: (next) => {
      try {
        if (next) localStorage.setItem(PIN_KEY, next);
        else localStorage.removeItem(PIN_KEY);
      } catch {
        // private window or blocked storage: the choice just won't persist
      }
      set(next ? { pinned: next, level: next } : { pinned: null });
    },
  };
});

/**
 * Effective flush gap right now.
 *
 * Zero while a smooth-motion view is up. Synthetic vision flies the camera
 * straight off the position in the store, so thinning it does not cost a few
 * frames of detail, it makes the aircraft jump backwards between samples. And
 * thinning would not even help: that view's cost is its own 3D render, not the
 * store write, so a governor reacting to it would just starve the data while
 * the frame time stayed exactly where it was.
 */
export function flushIntervalMs(): number {
  const { level, pinned, smoothConsumers } = useRenderGovernor.getState();
  if (smoothConsumers > 0) return 0;
  return FLUSH_INTERVAL_MS[pinned ?? level];
}

/** Mark this view as needing every telemetry sample while it is mounted. */
export function useSmoothTelemetry(): void {
  useEffect(() => {
    useRenderGovernor.setState((s) => ({ smoothConsumers: s.smoothConsumers + 1 }));
    return () => {
      useRenderGovernor.setState((s) => ({ smoothConsumers: Math.max(0, s.smoothConsumers - 1) }));
    };
  }, []);
}

/**
 * The guard lives on globalThis, not in a module variable: a hot reload
 * re-evaluates the module and would reset a local flag, so every edit during a
 * dev session stacked another permanent frame loop on top of the last.
 */
const RUNNING_FLAG = '__ardudeckRenderGovernorRunning';

/**
 * Start sampling frame times. Idempotent, and a no-op without rAF (tests).
 */
export function startRenderGovernor(): void {
  const g = globalThis as Record<string, unknown>;
  if (g[RUNNING_FLAG] === true || typeof requestAnimationFrame !== 'function') return;
  g[RUNNING_FLAG] = true;

  let rafId = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    g[RUNNING_FLAG] = false;
  };
  import.meta.hot?.dispose(stop);

  // Without hardware acceleration the first seconds are the worst ones, so
  // start thinned rather than making the user watch it struggle first.
  void window.electronAPI?.getGraphicsInfo?.().then((info) => {
    const state = useRenderGovernor.getState();
    if (info?.softwareRendering && !state.pinned && state.level === 'full') {
      useRenderGovernor.setState({ level: 'reduced' });
    }
  }).catch(() => undefined);

  let last = performance.now();
  let slow = 0;
  let total = 0;
  let sinceVerdict = 0;

  const tick = (now: number) => {
    const dt = now - last;
    last = now;

    // A backgrounded window produces one enormous frame; that is not the
    // machine struggling, so it must not drag the level down.
    if (dt < 1000) {
      total += 1;
      if (dt > SLOW_FRAME_MS) slow += 1;
      sinceVerdict += dt;
    }

    if (total >= 60) {
      const slowShare = slow / total;
      const state = useRenderGovernor.getState();
      const level = state.pinned
        ? state.pinned
        : nextLevel(state.level, { slowShare, heldMs: sinceVerdict });
      if (level !== state.level || slowShare !== state.slowShare) {
        useRenderGovernor.setState({ level, slowShare });
      }
      if (level !== state.level) sinceVerdict = 0;
      slow = 0;
      total = 0;
    }

    if (!stopped) rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

/**
 * Coalesce high-rate updates into at most one call per flush interval, always
 * delivering the most recent value. Returns a push function.
 */
export function createCoalescer<T>(apply: (value: T) => void): (value: T) => void {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = 0;

  const run = () => {
    timer = null;
    lastRun = Date.now();
    const value = pending;
    pending = null;
    if (value !== null) apply(value);
  };

  return (value: T) => {
    const gap = flushIntervalMs();
    if (gap === 0) {
      apply(value);
      return;
    }
    pending = value;
    if (timer) return;
    const wait = Math.max(0, gap - (Date.now() - lastRun));
    timer = setTimeout(run, wait);
  };
}
