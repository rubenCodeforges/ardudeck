/**
 * MAVLink Inspector store.
 *
 * The inspector observes the raw frame stream and tracks, per
 * (sysid, compid, msgid) tuple: the latest decoded field values, message rate
 * (Hz), throughput (Bps), and total count seen. Per-packet updates land in a
 * module-level Map (cheap, no React re-render); a 4Hz tick triggers consumers
 * to re-render. This matches Mission Planner's 333ms inspector cadence — fast
 * enough to feel live, slow enough that a 50Hz IMU stream doesn't melt React.
 *
 * Also feeds FieldGraph pop-outs: each graph subscribes to a specific
 * (key, fieldPath) and pulls the latest scalar from the per-message state.
 */

import { create } from 'zustand';
// Import via the package's `/registry` subpath instead of the main barrel —
// the main barrel re-exports `core/signing.js` which uses `node:crypto`, and
// Vite externalizes that for the renderer producing a runtime error. The
// registry subpath gives us just the decoders we need.
import { getMessageInfo } from '@ardudeck/mavlink-ts/registry';
import { probeTime } from '../lib/perf-probe';

export interface PacketEvent {
  msgid: number;
  sysid: number;
  compid: number;
  seq: number;
  payload: number[];
  rxtime: number;
  isMavlink2: boolean;
  isSigned: boolean;
}

/** Per-message live state. Key format: `${sysid}:${compid}:${msgid}`. */
export interface MessageStats {
  key: string;
  sysid: number;
  compid: number;
  msgid: number;
  /** Human-readable name from the generated registry, or "MSG_<id>" fallback. */
  name: string;
  /** Last decoded payload object (or null if no decoder available). */
  fields: Record<string, unknown> | null;
  /** Raw payload bytes from the most recent packet. */
  lastPayload: Uint8Array;
  /** Wall-clock receive time (ms since epoch) of the most recent packet. */
  lastRxtime: number;
  /** Total number of packets seen since the inspector store was created. */
  count: number;
  /** Computed message rate (Hz). Sampled over the previous tick window. */
  hz: number;
  /** Computed byte rate (Bps). Sampled over the previous tick window. */
  bps: number;
  /** Whether the last packet of this type was signed (MAVLink v2 signing). */
  isSigned: boolean;
}

/** Snapshot of known sysid → compid → msgid hierarchy for the tree UI. */
export interface InspectorSnapshot {
  /** Stable ordering: sysid then compid then msgid. */
  bySysComp: Map<string, MessageStats[]>;
  /** Flat list — used for searching/filtering. */
  flat: MessageStats[];
  /** Bumped on each tick so consumers can re-render via Zustand. */
  tick: number;
}

interface RateAccumulator {
  countSinceTick: number;
  bytesSinceTick: number;
}

const stats = new Map<string, MessageStats>();
const rateAcc = new Map<string, RateAccumulator>();
let lastTickAt = Date.now();
let snapshotCache: InspectorSnapshot | null = null;

/**
 * Single time-series sample plotted by a FieldGraph.
 */
export interface GraphSample {
  /** Wall-clock timestamp (ms since epoch) — matches the packet's rxtime. */
  t: number;
  /** Numeric field value at that time. */
  v: number;
}

/**
 * Per-graph sample buffer. Lives at the module level (not inside the React
 * component) so that:
 *   - Switching views (Inspector → Telemetry → Inspector) doesn't blow away
 *     a graph's accumulated history.
 *   - Popping out a graph can SEED the popped window's buffer with the
 *     current samples, so the user doesn't see the graph "restart" in the
 *     new window.
 *
 * Keyed by panelIdForGraph(spec). Capped per buffer to avoid unbounded growth.
 */
const sampleBuffers = new Map<string, GraphSample[]>();
const SAMPLE_BUFFER_CAP = 600;

export function appendSample(panelId: string, t: number, v: number): void {
  let list = sampleBuffers.get(panelId);
  if (!list) {
    list = [];
    sampleBuffers.set(panelId, list);
  }
  list.push({ t, v });
  if (list.length > SAMPLE_BUFFER_CAP) {
    list.splice(0, list.length - SAMPLE_BUFFER_CAP);
  }
}

export function getSamples(panelId: string): GraphSample[] {
  return sampleBuffers.get(panelId) ?? [];
}

/**
 * Seed a buffer with samples from another window (used when a popout
 * inherits history from the parent inspector). Replaces any existing buffer
 * — popouts always overwrite because their initial empty buffer is just an
 * artefact of being a fresh renderer process.
 */
export function seedSamples(panelId: string, samples: GraphSample[]): void {
  sampleBuffers.set(panelId, [...samples]);
}

export function clearSamples(panelId: string): void {
  sampleBuffers.delete(panelId);
}

export function clearAllSamples(): void {
  sampleBuffers.clear();
}

/**
 * One graph the user has opened from the inspector tree. Kept here in the
 * store (not in dockview's internal state) so that navigating away from the
 * inspector and back doesn't wipe the user's plotted fields.
 */
export interface GraphSpec {
  sysid: number;
  compid: number;
  msgid: number;
  messageName: string;
  fieldName: string;
}

export function panelIdForGraph(g: GraphSpec): string {
  return `g_${g.sysid}_${g.compid}_${g.msgid}_${g.fieldName}`;
}

interface InspectorStore {
  /** Bumps every UI tick (250ms) so React re-renders. Increment-only counter. */
  tick: number;
  /** Whether outgoing/GCS traffic should be included in the tree. (v1: not used; reserved.) */
  showOutgoing: boolean;
  /** Whether a paused inspector freezes counts/fields (for inspection). */
  paused: boolean;
  /** Per-msg filter text — matches against message name (case-insensitive substring). */
  filterText: string;
  /** Sysid filter (0 = all). */
  sysidFilter: number;
  /** Compid filter (0 = all). */
  compidFilter: number;
  /**
   * Graphs the user has plotted, in tab order. Survives view changes
   * because the store outlives the inspector component.
   */
  graphs: GraphSpec[];
  /**
   * Tree node ids that are currently expanded. Stored as a sorted list (not
   * Set) so it's serializable and selectors can do shallow equality.
   */
  expandedTreeKeys: string[];
  /** Reset all stats. Called on connection state changes. */
  reset: () => void;
  setShowOutgoing: (v: boolean) => void;
  setPaused: (v: boolean) => void;
  setFilterText: (v: string) => void;
  setSysidFilter: (v: number) => void;
  setCompidFilter: (v: number) => void;
  /** Add a graph to the workspace. No-op if a graph for that field is already plotted. */
  addGraph: (spec: GraphSpec) => void;
  /** Remove a graph by panel id (matches `panelIdForGraph`). */
  removeGraph: (panelId: string) => void;
  /** Remove every graph — used when the user wipes the inspector. */
  clearGraphs: () => void;
  /** Toggle a tree node's expanded state. */
  toggleTreeExpanded: (key: string) => void;
}

/**
 * Apply pause/reset locally without re-broadcasting — used by the IPC
 * listener so a broadcast from another window updates this window's store
 * without bouncing right back through main.
 */
function applyPausedLocal(v: boolean): void {
  useInspectorStore.setState({ paused: v });
}
function applyResetLocal(): void {
  stats.clear();
  rateAcc.clear();
  snapshotCache = null;
  // Clearing stats while keeping the graph tabs would mean every graph
  // shows a flat line for the period it had no samples. Wiping the sample
  // buffers makes Clear a clean slate everywhere.
  sampleBuffers.clear();
  useInspectorStore.setState((s) => ({ tick: s.tick + 1 }));
}

export const useInspectorStore = create<InspectorStore>((set) => ({
  tick: 0,
  showOutgoing: false,
  paused: false,
  filterText: '',
  sysidFilter: 0,
  compidFilter: 0,
  graphs: [],
  expandedTreeKeys: [],
  /**
   * Clear stats here AND in every other window. We send the broadcast
   * before the local clear so the user's click feels instant; the IPC echo
   * will arrive and re-run applyResetLocal (idempotent).
   */
  reset: () => {
    window.electronAPI?.broadcastInspector?.({ type: 'reset' }).catch(() => {});
    applyResetLocal();
    set({ tick: 0 });
  },
  setShowOutgoing: (v) => set({ showOutgoing: v }),
  /**
   * Toggle pause everywhere — broadcast through main so the popped-out graph
   * window and the main inspector freeze together.
   */
  setPaused: (v) => {
    window.electronAPI?.broadcastInspector?.({ type: 'paused', paused: v }).catch(() => {});
    set({ paused: v });
  },
  setFilterText: (v) => set({ filterText: v }),
  setSysidFilter: (v) => set({ sysidFilter: v }),
  setCompidFilter: (v) => set({ compidFilter: v }),
  addGraph: (spec) =>
    set((s) => {
      const id = panelIdForGraph(spec);
      if (s.graphs.some((g) => panelIdForGraph(g) === id)) return s;
      return { graphs: [...s.graphs, spec] };
    }),
  removeGraph: (panelId) => {
    clearSamples(panelId);
    set((s) => ({ graphs: s.graphs.filter((g) => panelIdForGraph(g) !== panelId) }));
  },
  clearGraphs: () => {
    clearAllSamples();
    set({ graphs: [] });
  },
  toggleTreeExpanded: (key) =>
    set((s) => {
      if (s.expandedTreeKeys.includes(key)) {
        return { expandedTreeKeys: s.expandedTreeKeys.filter((k) => k !== key) };
      }
      return { expandedTreeKeys: [...s.expandedTreeKeys, key] };
    }),
}));

function keyFor(sysid: number, compid: number, msgid: number): string {
  return `${sysid}:${compid}:${msgid}`;
}

/**
 * Hot path — called for every received packet. Updates the Map directly
 * (no Zustand set() to avoid per-packet re-renders). The 4Hz tick is what
 * triggers UI updates.
 */
export function ingestPacket(p: PacketEvent): void {
  if (useInspectorStore.getState().paused) return;
  const k = keyFor(p.sysid, p.compid, p.msgid);
  const info = getMessageInfo(p.msgid);
  const payloadBytes = new Uint8Array(p.payload);

  let entry = stats.get(k);
  if (!entry) {
    entry = {
      key: k,
      sysid: p.sysid,
      compid: p.compid,
      msgid: p.msgid,
      name: info?.name ?? `MSG_${p.msgid}`,
      fields: null,
      lastPayload: payloadBytes,
      lastRxtime: p.rxtime,
      count: 0,
      hz: 0,
      bps: 0,
      isSigned: p.isSigned,
    };
    stats.set(k, entry);
  }

  entry.lastPayload = payloadBytes;
  entry.lastRxtime = p.rxtime;
  entry.count += 1;
  entry.isSigned = p.isSigned;

  if (info) {
    try {
      // MAVLink v2 truncates trailing zero bytes from the payload, so a
      // received payload is often shorter than the message's full length
      // (e.g. SERVO_OUTPUT_RAW with servo9-16 all zero). The generated
      // deserializers read at fixed offsets up to maxLength and would throw
      // a RangeError on a truncated buffer. Zero-pad back to maxLength so
      // the missing trailing fields decode as 0.
      const full = payloadBytes.length < info.maxLength
        ? (() => { const b = new Uint8Array(info.maxLength); b.set(payloadBytes); return b; })()
        : payloadBytes;
      const decoded = info.deserialize(full);
      // Decoded result is a typed message object — its enumerable properties
      // are the fields we want to display.
      entry.fields = decoded as Record<string, unknown>;
    } catch {
      // Malformed payload — leave previous fields visible, don't crash.
    }
  }

  let acc = rateAcc.get(k);
  if (!acc) {
    acc = { countSinceTick: 0, bytesSinceTick: 0 };
    rateAcc.set(k, acc);
  }
  acc.countSinceTick += 1;
  acc.bytesSinceTick += payloadBytes.length;
}

/**
 * Sample tick — called every 250ms. Folds the per-window accumulators into
 * Hz/Bps on each message stats entry and bumps the store tick so React
 * re-renders subscribed components.
 */
function tickOnce(): void {
  const now = Date.now();
  const dt = (now - lastTickAt) / 1000;
  lastTickAt = now;
  if (dt <= 0) return;

  for (const [k, entry] of stats) {
    const acc = rateAcc.get(k);
    if (acc) {
      entry.hz = acc.countSinceTick / dt;
      entry.bps = acc.bytesSinceTick / dt;
      acc.countSinceTick = 0;
      acc.bytesSinceTick = 0;
    } else {
      entry.hz = 0;
      entry.bps = 0;
    }
  }

  snapshotCache = null;
  useInspectorStore.setState((s) => ({ tick: s.tick + 1 }));
}

let tickHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the inspector — sets up the IPC packet subscription and the 4Hz tick.
 * Idempotent: calling more than once is a no-op. Called from App.tsx and
 * DetachedRoot.tsx so the inspector works in every window.
 */
export function startInspector(): void {
  if (tickHandle) return;
  // Live in the same renderer process means the subscription is per-window;
  // each window gets the broadcast directly from main and feeds its own copy
  // of the stats Map (each window has its own JS context).
  // TEMP perf probe: attribute per-packet ingest cost (remove with perf-probe).
  const unsubscribe = window.electronAPI?.onPacket?.((p) => probeTime('inspector', () => ingestPacket(p)));
  tickHandle = setInterval(tickOnce, 250);

  // Cross-window sync of inspector state — when another window pauses or
  // clears, main re-broadcasts to us and we apply it locally without
  // re-broadcasting (which would bounce forever).
  const unsubscribeBroadcast = window.electronAPI?.onInspectorBroadcast?.((event) => {
    if (event.type === 'paused' && typeof event.paused === 'boolean') {
      if (useInspectorStore.getState().paused !== event.paused) {
        applyPausedLocal(event.paused);
      }
    } else if (event.type === 'reset') {
      applyResetLocal();
    }
  });

  // Best-effort teardown if the window is closed without the listener being
  // removed (the OS will clean up anyway, but it keeps HMR tidy).
  window.addEventListener('beforeunload', () => {
    unsubscribe?.();
    unsubscribeBroadcast?.();
  });
}

/**
 * Build the snapshot consumed by the inspector tree. Cached between ticks
 * because the tree shape only changes when new (sysid,compid,msgid) tuples
 * appear, but consumers read it on every render.
 */
export function getInspectorSnapshot(): InspectorSnapshot {
  if (snapshotCache) return snapshotCache;
  const flat = [...stats.values()].sort((a, b) =>
    a.sysid - b.sysid || a.compid - b.compid || a.msgid - b.msgid
  );
  const bySysComp = new Map<string, MessageStats[]>();
  for (const s of flat) {
    const sysCompKey = `${s.sysid}:${s.compid}`;
    let list = bySysComp.get(sysCompKey);
    if (!list) {
      list = [];
      bySysComp.set(sysCompKey, list);
    }
    list.push(s);
  }
  snapshotCache = { bySysComp, flat, tick: useInspectorStore.getState().tick };
  return snapshotCache;
}

/** Look up a single field's current value (for FieldGraph pop-outs). */
export function getFieldValue(
  sysid: number,
  compid: number,
  msgid: number,
  fieldName: string,
): number | null {
  const entry = stats.get(keyFor(sysid, compid, msgid));
  if (!entry || !entry.fields) return null;
  const v = entry.fields[fieldName];
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return null;
}

/** Look up a message stats entry (used by FieldGraph for header display). */
export function getMessageStats(
  sysid: number,
  compid: number,
  msgid: number,
): MessageStats | undefined {
  return stats.get(keyFor(sysid, compid, msgid));
}
