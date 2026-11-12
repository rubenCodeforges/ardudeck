/**
 * Visibility, scale, opacity and layouts of the floating map instrument
 * widgets over the telemetry map. The attitude ball is the 'attitude'
 * registry instrument like everything else. The store only holds explicit
 * user choices; anything untouched falls back to the registry's
 * per-instrument default. Persisted to localStorage so the operator's
 * cockpit arrangement survives restarts.
 *
 * Widget drag positions are persisted separately by useDraggableOverlay
 * (anchor payloads under map-overlay-pos:*). Named layouts snapshot both
 * halves: this store's state AND the position payloads; applying a layout
 * writes positions back and bumps layoutRev, which remounts the widgets so
 * they re-read their stored position.
 */
import { create } from 'zustand';
import { MAP_INSTRUMENTS, allMapInstruments, findMapInstrument } from '../components/map/instruments/registry';
import { isCargoInstrumentId } from '../modules/module-map-instruments';
import {
  readOverlayPosPayload,
  writeOverlayPosPayload,
  clearOverlayPosPayload,
  USER_MOVED_EVENT,
} from '../components/map/useDraggableOverlay';
import {
  sanitizeGroups,
  createGroup,
  createCluster,
  addMember,
  addClusterMember,
  setClusterOffset,
  removeMember,
  reorderMember,
  mergeGroups,
  dissolveGroup,
  isCluster,
  groupOf,
  groupOverlayKey,
  CLUSTER_ANCHOR,
  type DockGroups,
} from '../components/map/instruments/dock-groups';
import type { DockOrientation } from '../components/map/instruments/dock-snap';

const STORAGE_KEY = 'map-instruments-visible';
const LAYOUTS_STORAGE_KEY = 'map-instrument-layouts';
// Pre-split cockpit snapshot. Persisted because the split itself survives a
// relaunch; without this, restarting while split loses the state to restore.
const SPLIT_RESTORE_KEY = 'map-instruments-split-restore';
// Name of the preset or saved instrument layout last applied, so a workspace layout records it.
const ACTIVE_PRESET_KEY = 'map-instruments-active-preset';

function readActivePreset(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PRESET_KEY);
  } catch {
    return null;
  }
}

export const INSTRUMENT_SCALE_MIN = 0.5;
export const INSTRUMENT_SCALE_MAX = 1.6;
/** Resize moves in these detents so different instruments land on IDENTICAL
 * scales (matching sizes by eye is impossible with a continuous scale). */
export const INSTRUMENT_SCALE_STEP = 0.1;
export const INSTRUMENT_OPACITY_MIN = 0.25;

/** Overlay-position keys a layout snapshot covers (instruments + docked groups). */
function layoutPosKeys(groups: DockGroups): string[] {
  return [
    ...allMapInstruments().map((i) => 'instrument:' + i.id),
    ...Object.keys(groups).map(groupOverlayKey),
  ];
}

// Cargo instruments register after this store loads, so their ids pass on shape alone.
const INSTRUMENT_IDS = MAP_INSTRUMENTS.map((i) => i.id);
function knownIdsPlusCargo(parsed: unknown): string[] {
  const extra = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') { if (isCargoInstrumentId(v)) extra.add(v); return; }
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(parsed);
  return extra.size === 0 ? INSTRUMENT_IDS : [...INSTRUMENT_IDS, ...extra];
}

/** The analog gauge, the numeric card, or any variant id an instrument
 * registers (strip/cell/inline, or a bespoke one like the battery's 'used').
 * Missing = analog. The open string is deliberate: the registry owns the list. */
export type InstrumentDisplayMode = 'analog' | 'numeric' | 'strip' | 'cell' | 'inline' | (string & {});

const BUILTIN_DISPLAY_MODES = ['analog', 'numeric', 'strip', 'cell', 'inline'] as const;

// Validating against the registry rather than a hardcoded union: a mode not
// listed here is dropped on load, which silently reverted bespoke variants.
const DISPLAY_MODES: ReadonlySet<string> = new Set<string>([
  ...BUILTIN_DISPLAY_MODES,
  ...MAP_INSTRUMENTS.flatMap((i) => (i.variants ?? []).map((v) => v.id)),
]);

export interface InstrumentLayoutSnapshot {
  visible: Record<string, boolean>;
  scale: Record<string, number>;
  opacity: number;
  /** Per-instrument opacity overrides (missing = follow global opacity). */
  instrumentOpacity?: Record<string, number>;
  /** Per-instrument analog/numeric choice (missing = analog). */
  displayMode?: Record<string, InstrumentDisplayMode>;
  /** Docked instrument groups (missing = none). */
  groups?: DockGroups;
  /** Overlay key -> stored position payload (anchor v3, or legacy). */
  positions: Record<string, unknown>;
}

const DEFAULT_VISIBLE: Record<string, boolean> = Object.fromEntries(
  MAP_INSTRUMENTS.map((i) => [i.id, i.defaultVisible]),
);

function clampScale(v: number): number {
  const stepped = Math.round(v / INSTRUMENT_SCALE_STEP) * INSTRUMENT_SCALE_STEP;
  // Kill float noise (0.7000000000000001) so persisted values compare clean.
  const rounded = Math.round(stepped * 100) / 100;
  return Math.max(INSTRUMENT_SCALE_MIN, Math.min(INSTRUMENT_SCALE_MAX, rounded));
}

function clampOpacity(v: number): number {
  return Math.max(INSTRUMENT_OPACITY_MIN, Math.min(1, v));
}

// False entries must survive too: they override a defaultVisible: true.
function sanitizeVisible(parsed: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}

function sanitizeScale(parsed: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = clampScale(v);
    }
  }
  return out;
}

function sanitizeInstrumentOpacity(parsed: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = clampOpacity(v);
    }
  }
  return out;
}

function sanitizeDisplayMode(parsed: unknown): Record<string, InstrumentDisplayMode> {
  const out: Record<string, InstrumentDisplayMode> = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && (DISPLAY_MODES.has(v) || isCargoInstrumentId(k))) out[k] = v;
    }
  }
  return out;
}

// Proximity was a rangefinder display variant before it got its own id.
export function migrateProximityVariant(parsed: Record<string, unknown>): Record<string, unknown> {
  const modes = parsed.displayMode;
  if (!modes || typeof modes !== 'object' || (modes as Record<string, unknown>).rangefinder !== 'proximity') return parsed;
  const displayMode = { ...(modes as Record<string, unknown>) };
  delete displayMode.rangefinder;
  const moveKey = (obj: unknown, from: string, to: string): unknown => {
    if (!obj || typeof obj !== 'object') return obj;
    const rec = { ...(obj as Record<string, unknown>) };
    if (from in rec) {
      rec[to] = rec[from];
      delete rec[from];
    }
    return rec;
  };
  const visible = { ...((parsed.visible && typeof parsed.visible === 'object' ? parsed.visible : {}) as Record<string, unknown>) };
  if (visible.rangefinder === true) {
    visible.proximity = true;
    visible.rangefinder = false;
  }
  const groups = parsed.groups && typeof parsed.groups === 'object'
    ? Object.fromEntries(Object.entries(parsed.groups as Record<string, unknown>).map(([gid, g]) => {
        const raw = g as { members?: unknown } | null;
        return [gid, raw && Array.isArray(raw.members) ? { ...raw, members: raw.members.map((m) => (m === 'rangefinder' ? 'proximity' : m)) } : g];
      }))
    : parsed.groups;
  return {
    ...parsed,
    displayMode,
    visible,
    groups,
    scale: moveKey(parsed.scale, 'rangefinder', 'proximity'),
    instrumentOpacity: moveKey(parsed.instrumentOpacity, 'rangefinder', 'proximity'),
    positions: moveKey(parsed.positions, 'instrument:rangefinder', 'instrument:proximity'),
  };
}

interface PersistedMain {
  visible: Record<string, boolean>;
  scale: Record<string, number>;
  opacity: number;
  instrumentOpacity: Record<string, number>;
  displayMode: Record<string, InstrumentDisplayMode>;
  groups: DockGroups;
}

// Payload v4 adds { groups }; v3 { opacity, instrumentOpacity, displayMode };
// v2 was { visible, scale }; v1 the flat visible map itself.
function readStored(): PersistedMain {
  const fallback: PersistedMain = { visible: {}, scale: {}, opacity: 1, instrumentOpacity: {}, displayMode: {}, groups: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    if (stored && typeof stored === 'object' && ('visible' in stored || 'scale' in stored)) {
      const parsed = migrateProximityVariant(stored);
      if (parsed !== stored) {
        const pos = readOverlayPosPayload('instrument:rangefinder');
        if (pos !== null && readOverlayPosPayload('instrument:proximity') === null) writeOverlayPosPayload('instrument:proximity', pos);
      }
      const main: PersistedMain = {
        visible: sanitizeVisible(parsed.visible),
        scale: sanitizeScale(parsed.scale),
        opacity: typeof parsed.opacity === 'number' && Number.isFinite(parsed.opacity) ? clampOpacity(parsed.opacity) : 1,
        instrumentOpacity: sanitizeInstrumentOpacity(parsed.instrumentOpacity),
        displayMode: sanitizeDisplayMode(parsed.displayMode),
        groups: sanitizeGroups(parsed.groups, knownIdsPlusCargo(parsed.groups)),
      };
      if (parsed !== stored) persist(main);
      return main;
    }
    const parsed = stored;
    return { ...fallback, visible: sanitizeVisible(parsed) };
  } catch {
    return fallback;
  }
}

function persist(s: PersistedMain): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage full/blocked: keep in-memory state only
  }
}

export function sanitizeLayout(parsed: unknown): InstrumentLayoutSnapshot | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = migrateProximityVariant(parsed as Record<string, unknown>);
  return {
    visible: sanitizeVisible(p.visible),
    scale: sanitizeScale(p.scale),
    opacity: typeof p.opacity === 'number' && Number.isFinite(p.opacity) ? clampOpacity(p.opacity) : 1,
    instrumentOpacity: sanitizeInstrumentOpacity(p.instrumentOpacity),
    displayMode: sanitizeDisplayMode(p.displayMode),
    groups: sanitizeGroups(p.groups, knownIdsPlusCargo(p.groups)),
    positions: p.positions && typeof p.positions === 'object' ? (p.positions as Record<string, unknown>) : {},
  };
}

function readStoredLayouts(): Record<string, InstrumentLayoutSnapshot> {
  try {
    const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, InstrumentLayoutSnapshot> = {};
    if (parsed && typeof parsed === 'object') {
      for (const [name, layout] of Object.entries(parsed)) {
        const s = sanitizeLayout(layout);
        if (s) out[name] = s;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistLayouts(layouts: Record<string, InstrumentLayoutSnapshot>): void {
  try {
    localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // storage full/blocked
  }
}

/** Effective visibility: explicit user choice wins, else the registry default. */
export function resolveInstrumentVisible(overrides: Record<string, boolean>, id: string): boolean {
  return overrides[id] ?? DEFAULT_VISIBLE[id] ?? (isCargoInstrumentId(id) ? findMapInstrument(id)?.defaultVisible ?? false : false);
}

interface MapInstrumentsStore {
  /** Explicit user choices only; use resolveInstrumentVisible for reads. */
  visible: Record<string, boolean>;
  /** Per-instrument zoom factor; missing entry = 1 (natural size). */
  scale: Record<string, number>;
  /** Idle opacity of all on-map instruments (hover always restores 1). */
  opacity: number;
  /** Per-instrument opacity override; missing entry = follow global. */
  instrumentOpacity: Record<string, number>;
  /** Per-instrument analog/numeric choice; missing entry = analog. */
  displayMode: Record<string, InstrumentDisplayMode>;
  /** Docked instrument groups; members render inside one shared card. */
  groups: DockGroups;
  /** Bumped when a layout is applied; remounts widgets to re-read positions. */
  layoutRev: number;
  savedLayouts: Record<string, InstrumentLayoutSnapshot>;
  /** Preset or saved instrument layout last applied by name; null for anything else. */
  activePreset: string | null;
  toggle: (id: string) => void;
  setScale: (id: string, v: number) => void;
  setOpacity: (v: number) => void;
  /** null clears the override so the instrument follows the global opacity. */
  setInstrumentOpacity: (id: string, v: number | null) => void;
  setDisplayMode: (id: string, mode: InstrumentDisplayMode) => void;
  /** One display choice for several instruments at once (docked groups). */
  setDisplayModes: (ids: string[], mode: InstrumentDisplayMode) => void;
  /** Form a new group from two standalone instruments; pos is the group's
   * px top-left inside the map container. */
  dockCreate: (targetId: string, draggedId: string, orientation: DockOrientation, draggedFirst: boolean, pos: { x: number; y: number }) => void;
  /** pos, when given, re-anchors the group (a group absorbing a standalone
   * target repositions so the target stays put). */
  dockAdd: (gid: string, id: string, index: number, pos?: { x: number; y: number }) => void;
  /** Dragged card group merges into the target card group and dissolves. */
  dockMergeGroups: (targetGid: string, draggedGid: string, atStart: boolean) => void;
  /** Attitude-ball constellation: offset is the member's top-left relative to
   * the ball; pos the new union top-left. */
  dockCreateCluster: (otherId: string, offset: { x: number; y: number }, pos: { x: number; y: number }) => void;
  dockAddCluster: (gid: string, id: string, offset: { x: number; y: number }, pos: { x: number; y: number }) => void;
  dockSetClusterOffset: (gid: string, id: string, offset: { x: number; y: number }, pos: { x: number; y: number }) => void;
  /** Break a whole group apart, placing every member at the given px spot. */
  dockDissolve: (gid: string, positions: Record<string, { x: number; y: number }>) => void;
  /** Undock a member; dropPos places it, null leaves its old stored spot.
   * survivorPos pins the last remaining member when a pair dissolves. */
  dockRemove: (id: string, dropPos: { x: number; y: number } | null, survivorPos?: { x: number; y: number } | null) => void;
  dockReorder: (gid: string, from: number, to: number) => void;
  /** Card groups: toggle spanning the panel along the main axis. */
  dockSetStretch: (gid: string, on: boolean) => void;
  /** Current full instrument state as a layout snapshot (positions included). */
  captureLayoutSnapshot: () => InstrumentLayoutSnapshot;
  /** In-map split: swap to a compact profile, restore exactly on unsplit. */
  splitSnapshot: InstrumentLayoutSnapshot | null;
  enterSplitProfile: (profile: InstrumentLayoutSnapshot) => void;
  exitSplitProfile: () => void;
  saveLayout: (name: string) => void;
  applyLayout: (layout: InstrumentLayoutSnapshot, name?: string | null) => void;
  /**
   * Restore a workspace layout's cockpit: the instrument state plus the pre-split restore
   * point (null when the layout is not split), so the split lifecycle keeps working after.
   */
  restoreWorkspace: (layout: InstrumentLayoutSnapshot, splitRestore: InstrumentLayoutSnapshot | null, preset: string | null) => void;
  deleteLayout: (name: string) => void;
  /** Store an imported (shared) layout under a name; sanitises the raw payload
   * and returns false if it is not a valid layout snapshot. */
  importLayout: (name: string, raw: unknown) => boolean;
  /** Clear every instrument's stored drag position back to registry defaults. */
  resetPositions: () => void;
  /** Payloads captured before the last auto-arrange; null = nothing to undo. */
  arrangeSnapshot: Record<string, unknown | null> | null;
  setArrangeSnapshot: (snapshot: Record<string, unknown | null>) => void;
  clearArrangeSnapshot: () => void;
  bumpLayoutRev: () => void;
}

// One-time migration: the attitude ball persisted its drag position under
// 'attitude-ball' before it became the 'attitude' registry instrument.
{
  const legacyBall = readOverlayPosPayload('attitude-ball');
  if (legacyBall !== null && readOverlayPosPayload('instrument:attitude') === null) {
    writeOverlayPosPayload('instrument:attitude', legacyBall);
    clearOverlayPosPayload('attitude-ball');
  }
}

const initial = readStored();

export const useMapInstrumentsStore = create<MapInstrumentsStore>((set, get) => {
  const persistMain = () => {
    const { visible, scale, opacity, instrumentOpacity, displayMode, groups } = get();
    persist({ visible, scale, opacity, instrumentOpacity, displayMode, groups });
  };

  // Dissolving a pair hands the group's stored spot to the survivor so it
  // stays put instead of jumping to its pre-dock position.
  const applyDissolve = (dissolved: { gid: string; remaining: string } | null) => {
    if (!dissolved) return;
    const groupPayload = readOverlayPosPayload(groupOverlayKey(dissolved.gid));
    if (groupPayload !== null) writeOverlayPosPayload('instrument:' + dissolved.remaining, groupPayload);
    clearOverlayPosPayload(groupOverlayKey(dissolved.gid));
  };

  return {
    visible: initial.visible,
    scale: initial.scale,
    opacity: initial.opacity,
    instrumentOpacity: initial.instrumentOpacity,
    displayMode: initial.displayMode,
    groups: initial.groups,
    layoutRev: 0,
    savedLayouts: readStoredLayouts(),
    activePreset: readActivePreset(),

    toggle: (id) => {
      const wasVisible = resolveInstrumentVisible(get().visible, id);
      let groups = get().groups;
      const gid = wasVisible ? groupOf(groups, id) : null;
      if (gid && id === CLUSTER_ANCHOR && isCluster(groups[gid]!)) {
        // Hiding the ball breaks the whole constellation; members fall back
        // to their pre-dock stored spots.
        clearOverlayPosPayload(groupOverlayKey(gid));
        groups = dissolveGroup(groups, gid);
      } else if (gid) {
        const r = removeMember(groups, id);
        groups = r.groups;
        applyDissolve(r.dissolved);
      }
      set({
        visible: { ...get().visible, [id]: !wasVisible },
        groups,
        layoutRev: groups === get().groups ? get().layoutRev : get().layoutRev + 1,
      });
      persistMain();
    },

    setScale: (id, v) => {
      set({ scale: { ...get().scale, [id]: clampScale(v) } });
      persistMain();
    },

    setOpacity: (v) => {
      set({ opacity: clampOpacity(v) });
      persistMain();
    },

    setInstrumentOpacity: (id, v) => {
      const next = { ...get().instrumentOpacity };
      if (v === null) delete next[id];
      else next[id] = clampOpacity(v);
      set({ instrumentOpacity: next });
      persistMain();
    },

    setDisplayMode: (id, mode) => {
      set({ displayMode: { ...get().displayMode, [id]: mode } });
      persistMain();
    },

    setDisplayModes: (ids, mode) => {
      if (ids.length === 0) return;
      const next = { ...get().displayMode };
      for (const id of ids) next[id] = mode;
      set({ displayMode: next });
      persistMain();
    },

    dockCreate: (targetId, draggedId, orientation, draggedFirst, pos) => {
      let groups = get().groups;
      if (groupOf(groups, targetId) || groupOf(groups, draggedId)) return;
      const r = createGroup(groups, targetId, draggedId, orientation, draggedFirst);
      groups = r.groups;
      // Legacy px payload: the group re-derives its anchor on first mount.
      writeOverlayPosPayload(groupOverlayKey(r.gid), { x: pos.x, y: pos.y });
      // The new group inherits the TARGET's scale: a 70% instrument must not
      // snap to 100% the moment something docks onto it.
      const inherited = get().scale[targetId] ?? 1;
      set({
        groups,
        ...(inherited !== 1 ? { scale: { ...get().scale, ['group:' + r.gid]: inherited } } : {}),
        layoutRev: get().layoutRev + 1,
      });
      persistMain();
    },

    dockAdd: (gid, id, index, pos) => {
      const groups = addMember(get().groups, gid, id, index);
      if (groups === get().groups) return;
      if (pos) writeOverlayPosPayload(groupOverlayKey(gid), { x: pos.x, y: pos.y });
      set({ groups, layoutRev: get().layoutRev + 1 });
      persistMain();
    },

    dockMergeGroups: (targetGid, draggedGid, atStart) => {
      const groups = mergeGroups(get().groups, targetGid, draggedGid, atStart);
      if (groups === get().groups) return;
      clearOverlayPosPayload(groupOverlayKey(draggedGid));
      const scale = { ...get().scale };
      delete scale['group:' + draggedGid];
      set({ groups, scale, layoutRev: get().layoutRev + 1 });
      persistMain();
    },

    dockCreateCluster: (otherId, offset, pos) => {
      const groups = get().groups;
      if (groupOf(groups, CLUSTER_ANCHOR) || groupOf(groups, otherId)) return;
      const r = createCluster(groups, otherId, offset);
      writeOverlayPosPayload(groupOverlayKey(r.gid), { x: pos.x, y: pos.y });
      set({ groups: r.groups, layoutRev: get().layoutRev + 1 });
      persistMain();
    },

    dockAddCluster: (gid, id, offset, pos) => {
      const groups = addClusterMember(get().groups, gid, id, offset);
      if (groups === get().groups) return;
      writeOverlayPosPayload(groupOverlayKey(gid), { x: pos.x, y: pos.y });
      set({ groups, layoutRev: get().layoutRev + 1 });
      persistMain();
    },

    dockSetClusterOffset: (gid, id, offset, pos) => {
      const groups = setClusterOffset(get().groups, gid, id, offset);
      if (groups === get().groups) return;
      writeOverlayPosPayload(groupOverlayKey(gid), { x: pos.x, y: pos.y });
      set({ groups, layoutRev: get().layoutRev + 1 });
      persistMain();
    },

    dockDissolve: (gid, positions) => {
      const groups = get().groups;
      const g = groups[gid];
      if (!g) return;
      for (const member of g.members) {
        const p = positions[member];
        if (p) writeOverlayPosPayload('instrument:' + member, { x: p.x, y: p.y });
      }
      clearOverlayPosPayload(groupOverlayKey(gid));
      set({ groups: dissolveGroup(groups, gid), layoutRev: get().layoutRev + 1 });
      persistMain();
    },

    dockRemove: (id, dropPos, survivorPos) => {
      const r = removeMember(get().groups, id);
      if (r.groups === get().groups) return;
      if (r.dissolved && survivorPos) {
        writeOverlayPosPayload('instrument:' + r.dissolved.remaining, { x: survivorPos.x, y: survivorPos.y });
        clearOverlayPosPayload(groupOverlayKey(r.dissolved.gid));
      } else {
        applyDissolve(r.dissolved);
      }
      if (dropPos) writeOverlayPosPayload('instrument:' + id, { x: dropPos.x, y: dropPos.y });
      set({ groups: r.groups, layoutRev: get().layoutRev + 1 });
      persistMain();
    },

    dockSetStretch: (gid, on) => {
      const g = get().groups[gid];
      if (!g || isCluster(g) || (g.stretch === true) === on) return;
      const next = { ...g };
      if (on) next.stretch = true;
      else delete next.stretch;
      set({ groups: { ...get().groups, [gid]: next }, layoutRev: get().layoutRev + 1 });
      persistMain();
    },

    dockReorder: (gid, from, to) => {
      const groups = reorderMember(get().groups, gid, from, to);
      if (groups === get().groups) return;
      set({ groups });
      persistMain();
    },

    captureLayoutSnapshot: () => {
      const { visible, scale, opacity, instrumentOpacity, displayMode, groups } = get();
      const positions: Record<string, unknown> = {};
      for (const key of layoutPosKeys(groups)) {
        const payload = readOverlayPosPayload(key);
        if (payload !== null) positions[key] = payload;
      }
      // Snapshot the RESOLVED visibility so a later registry-default change
      // can't silently alter a saved layout.
      const resolvedVisible: Record<string, boolean> = Object.fromEntries(
        allMapInstruments().map((i) => [i.id, resolveInstrumentVisible(visible, i.id)]),
      );
      return {
        visible: resolvedVisible,
        scale: { ...scale },
        opacity,
        instrumentOpacity: { ...instrumentOpacity },
        displayMode: { ...displayMode },
        groups: { ...groups },
        positions,
      };
    },

    saveLayout: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const next = { ...get().savedLayouts, [trimmed]: get().captureLayoutSnapshot() };
      persistLayouts(next);
      set({ savedLayouts: next });
    },

    // What the cockpit looked like before the split profile took over;
    // unsplitting restores it exactly, across app restarts too.
    splitSnapshot: (() => {
      try {
        const raw = localStorage.getItem(SPLIT_RESTORE_KEY);
        return raw ? sanitizeLayout(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    })(),
    enterSplitProfile: (profile) => {
      // A surviving snapshot means the split state is already on screen
      // (e.g. relaunch while split): keep the original restore point.
      if (get().splitSnapshot) return;
      const snapshot = get().captureLayoutSnapshot();
      get().applyLayout(profile);
      try { localStorage.setItem(SPLIT_RESTORE_KEY, JSON.stringify(snapshot)); } catch { /* full/blocked */ }
      set({ splitSnapshot: snapshot });
    },
    exitSplitProfile: () => {
      const snapshot = get().splitSnapshot;
      if (!snapshot) return;
      try { localStorage.removeItem(SPLIT_RESTORE_KEY); } catch { /* blocked */ }
      set({ splitSnapshot: null });
      get().applyLayout(snapshot);
    },

    applyLayout: (layout, name = null) => {
      try {
        if (name) localStorage.setItem(ACTIVE_PRESET_KEY, name);
        else localStorage.removeItem(ACTIVE_PRESET_KEY);
      } catch { /* blocked */ }
      set({ activePreset: name });
      const nextGroups = layout.groups ?? {};
      // Union of current and incoming group keys, so stale group positions
      // are cleared and incoming ones written.
      const keys = new Set([...layoutPosKeys(get().groups), ...layoutPosKeys(nextGroups)]);
      for (const key of keys) {
        if (key in layout.positions) writeOverlayPosPayload(key, layout.positions[key]);
        else clearOverlayPosPayload(key);
      }
      // A layout that never mentions a cargo instrument means "not in this layout", not the cargo's default.
      const visible = { ...layout.visible };
      for (const def of allMapInstruments()) {
        if (isCargoInstrumentId(def.id) && !(def.id in visible)) visible[def.id] = false;
      }
      set({
        visible,
        scale: { ...layout.scale },
        opacity: layout.opacity,
        instrumentOpacity: { ...(layout.instrumentOpacity ?? {}) },
        displayMode: { ...(layout.displayMode ?? {}) },
        groups: { ...nextGroups },
        layoutRev: get().layoutRev + 1,
      });
      persistMain();
    },

    restoreWorkspace: (layout, splitRestore, preset) => {
      try {
        if (splitRestore) localStorage.setItem(SPLIT_RESTORE_KEY, JSON.stringify(splitRestore));
        else localStorage.removeItem(SPLIT_RESTORE_KEY);
      } catch { /* full/blocked */ }
      set({ splitSnapshot: splitRestore });
      get().applyLayout(layout, preset);
    },

    deleteLayout: (name) => {
      const next = { ...get().savedLayouts };
      delete next[name];
      persistLayouts(next);
      set({ savedLayouts: next });
    },

    importLayout: (name, raw) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const snapshot = sanitizeLayout(raw);
      if (!snapshot) return false;
      const next = { ...get().savedLayouts, [trimmed]: snapshot };
      persistLayouts(next);
      set({ savedLayouts: next });
      return true;
    },

    resetPositions: () => {
      for (const key of layoutPosKeys(get().groups)) clearOverlayPosPayload(key);
      set({ groups: {} });
      persistMain();
      // Remount every slot so it re-reads (the now-absent) stored position and
      // falls back to its registry default class.
      set({ layoutRev: get().layoutRev + 1 });
    },

    arrangeSnapshot: null,
    setArrangeSnapshot: (snapshot) => set({ arrangeSnapshot: snapshot }),
    clearArrangeSnapshot: () => set({ arrangeSnapshot: null }),
    bumpLayoutRev: () => set({ layoutRev: get().layoutRev + 1 }),
  };
});

// A hand-moved instrument invalidates the arrange undo.
if (typeof window !== 'undefined') {
  window.addEventListener(USER_MOVED_EVENT, () => {
    if (useMapInstrumentsStore.getState().arrangeSnapshot) {
      useMapInstrumentsStore.getState().clearArrangeSnapshot();
    }
  });
}
