/**
 * objects-store — the Area Editor's object-based state (replaces the flat
 * polygon model). Every shape is an EditorObject (area-object.ts) that can be
 * selected, moved/rotated/scaled as a whole, renamed, reordered, hidden, and
 * (for parametric rect/circle) converted to a free polygon for vertex editing.
 *
 * Tool model (from the side rail):
 *   select   — pick an object; drag its transform handles (move/rotate/scale)
 *   polygon  — click to lay an area outline; double-click to finish
 *   corridor — click to lay a centerline; double-click to finish
 *   rectangle/circle — drag on the map to create (handled in interactions)
 *   edit     — per-vertex editing of the selected vertex-editable object
 *   measure  — transient distance/area readout
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import * as polygonClippingModule from 'polygon-clipping';
import type {
  Polygon as PCPolygon,
  MultiPolygon as PCMultiPolygon,
  Ring as PCRing,
} from 'polygon-clipping';

// polygon-clipping ships a UMD bundle: under Vite's dev pre-bundling the
// named exports aren't statically detectable and land on `.default`, while
// vitest/node resolve them on the namespace. Accept both shapes.
type PCGeomFn = (geom: PCPolygon | PCMultiPolygon, ...geoms: Array<PCPolygon | PCMultiPolygon>) => PCMultiPolygon;
const pcApi = ((polygonClippingModule as { default?: unknown }).default ?? polygonClippingModule) as {
  union: PCGeomFn;
  intersection: PCGeomFn;
};
const pcUnion: PCGeomFn = (...args) => pcApi.union(...args);
const pcIntersection: PCGeomFn = (...args) => pcApi.intersection(...args);
import type { LatLng } from '../components/survey/survey-types';
import { latLngToLocal, distanceLatLng } from '../components/survey/geo-math';
import { orderCorridorRuns, transitDistance } from '../components/survey/generators/corridor-route';
import { catmullRomSpline } from '../components/survey/geo-edit';
import {
  makeFromWorldRing,
  translateObject,
  rotateObject,
  scaleObjectAbout,
  convertToPolygon,
  cloneObject,
  worldToLocal,
  bufferObject,
  splitObjectByLine,
  clipRingToPolygon,
  snapToNearestPolyline,
  objectWorldRing,
  objectWorldBranches,
  objectWorldHoles,
  type EditorObject,
  type EditorObjectType,
  type LocalPt,
} from './area-object';

export type AreaTool = 'select' | 'polygon' | 'corridor' | 'spline' | 'rectangle' | 'circle' | 'edit' | 'measure' | 'hole' | 'split' | 'branch' | 'merge';

/** A draw tool collects world points before the object is finalized. */
const DRAW_TOOLS: AreaTool[] = ['polygon', 'corridor', 'spline', 'hole', 'branch'];

function minPointsForType(type: EditorObjectType): number {
  return type === 'corridor' ? 2 : 3;
}

/** Shoelace area of a local-frame ring (signed; absolute value = area in m²). */
function localRingArea(ring: LocalPt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Outcome of autoConnectCorridors, so the UI can report what it saved. */
export interface AutoConnectResult {
  trunkId: string;
  /** How many corridor objects were folded in. */
  absorbed: number;
  /** Dead legs between runs, flying them as listed, entering each at its start. */
  transitBeforeM: number;
  /** Dead legs after ordering and orienting the runs. */
  transitAfterM: number;
}

function polylineLength(line: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += distanceLatLng(line[i - 1]!, line[i]!);
  return total;
}

/** What a right-click landed on; drives the context menu's available actions. */
export type ContextTarget =
  | { kind: 'object'; id: string }
  | { kind: 'measure'; world: LatLng; pointIndex?: number }
  | { kind: 'empty' };

export interface ContextMenuState {
  /** Viewport coordinates (clientX/clientY) for fixed positioning. */
  x: number;
  y: number;
  target: ContextTarget;
}

/** The slice of state that undo/redo restores (geometry + selection). */
interface HistorySnapshot {
  objects: EditorObject[];
  selectedId: string | null;
  selectedVertex: number | null;
  selectedMeasure: boolean;
  measurePoints: LatLng[];
  measureDone: boolean;
}

const HISTORY_LIMIT = 50;

/** Tool/transient state forced after an undo or redo so the editor lands in a
 * predictable, interactive select mode (never stuck mid-draw or mid-cut). */
const NEUTRAL_TOOL_STATE = {
  tool: 'select' as AreaTool,
  draftPoints: [] as LatLng[],
  draftType: null as EditorObjectType | null,
  contextMenu: null as ContextMenuState | null,
} satisfies Partial<ObjectsState>;

function snapshot(s: ObjectsState): HistorySnapshot {
  return {
    objects: s.objects,
    selectedId: s.selectedId,
    selectedVertex: s.selectedVertex,
    selectedMeasure: s.selectedMeasure,
    measurePoints: s.measurePoints,
    measureDone: s.measureDone,
  };
}

interface ObjectsState {
  objects: EditorObject[];
  selectedId: string | null;
  /** Object the map should zoom to. Bumped seq so the same id can re-fire. */
  focusRequest: { id: string; seq: number } | null;
  tool: AreaTool;
  /** In-progress polygon/corridor outline (world points); empty when not drawing. */
  draftPoints: LatLng[];
  draftType: EditorObjectType | null;
  /** Vertex index being edited on the selected object (edit tool), or null. */
  selectedVertex: number | null;
  measurePoints: LatLng[];
  /** True once a measurement is finished (double-click); the next click starts a fresh one. */
  measureDone: boolean;
  /** True when the measurement (ruler) is the selected element (select tool). */
  selectedMeasure: boolean;
  /** Default swath width (m) for new corridors; also edits the selected corridor. */
  corridorWidthM: number;
  /** Monotonic counter so auto-names stay unique even after deletes. */
  nameSeq: number;
  /** Ticked rows in the objects list, for actions that run over several. */
  checkedIds: string[];
  /** Open right-click context menu, or null. */
  contextMenu: ContextMenuState | null;
  /** Undo stack (most recent last) and redo stack. */
  past: HistorySnapshot[];
  future: HistorySnapshot[];
}

interface ObjectsActions {
  setTool: (tool: AreaTool) => void;
  selectObject: (id: string | null) => void;
  /** Select the measurement (ruler) as the active element. */
  selectMeasure: () => void;

  // undo / redo
  /** Snapshot current geometry/selection before a mutating change. */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // right-click context menu
  toggleChecked: (id: string) => void;
  setChecked: (ids: string[]) => void;
  clearChecked: () => void;

  openContextMenu: (menu: ContextMenuState) => void;
  closeContextMenu: () => void;

  /** Clone an object in place (slight offset) and select the copy. */
  duplicateObject: (id: string) => void;

  /** Add a fully-built object (rectangle/circle from a drag), select it, return to select tool. */
  addObject: (obj: EditorObject) => void;

  /** Replace an object by id (used by drag transforms that work from a snapshot). */
  replaceObject: (obj: EditorObject) => void;

  // draft (polygon / corridor)
  addDraftPoint: (p: LatLng) => void;
  finishDraft: () => void;
  /** Finish the in-progress ring as a HOLE cut into the selected area. */
  finishHole: () => void;
  /** Finish the in-progress centerline as a BRANCH on the selected corridor. */
  finishBranch: () => void;
  /** Remove all branches from a corridor (defaults to the selected object). */
  clearBranches: (id?: string) => void;
  /** Remove a single branch (by index) from a corridor. */
  removeBranch: (id: string, index: number) => void;
  /**
   * Join corridors into ONE routable survey: the longest becomes the trunk,
   * the rest attach as branches at their nearest end, and the generator then
   * orders and orients every run to keep the dead legs short. Pass the ids to
   * act on, or omit for every visible corridor.
   */
  autoConnectCorridors: (ids?: string[]) => AutoConnectResult | null;
  cancelDraft: () => void;

  // whole-object transforms (operate on the selected object)
  translateSelected: (dLat: number, dLng: number) => void;
  rotateSelected: (deltaDeg: number) => void;
  scaleSelected: (sx: number, sy: number, anchor: LocalPt) => void;

  // object-list operations
  renameObject: (id: string, name: string) => void;
  setObjectColor: (id: string, color: string) => void;
  setObjectFenceType: (id: string, fenceType: 'inclusion' | 'exclusion' | null) => void;
  /** Grant/clear the workspace role; at most one object holds it at a time. */
  setObjectRole: (id: string, role: 'workspace' | 'guide' | null) => void;
  /**
   * Union the given polygon with every visible overlapping polygon (transitively,
   * so chains of overlaps collapse into one pass). Merged sources are removed and
   * replaced by the union result. Corridors, fences and role-carrying objects
   * (workspace/guide) are never merged. Returns the number of objects absorbed
   * (0 = nothing overlapped, no change).
   */
  mergeOverlapping: (id: string) => number;
  deleteObject: (id: string) => void;
  deleteSelected: () => void;
  toggleVisible: (id: string) => void;
  reorderObject: (id: string, dir: -1 | 1) => void;
  convertSelectedToPolygon: () => void;
  /** Grow (m>0) / shrink (m<0) the selected area by a distance in metres. */
  bufferSelected: (meters: number) => void;
  /** Slice the selected area with a straight line (two world points) into two. */
  splitSelectedByLine: (p1: LatLng, p2: LatLng) => void;

  // vertex editing (selected, vertex-editable object). `branch` is -1 for the
  // main ring/centerline, or a corridor branch index.
  selectVertex: (i: number | null) => void;
  moveVertex: (i: number, world: LatLng, branch?: number, hole?: number) => void;
  insertVertexAfter: (i: number, world: LatLng, hole?: number) => void;
  deleteVertex: (i: number, branch?: number, hole?: number) => void;

  // measure
  addMeasurePoint: (p: LatLng) => void;
  /** Finish the current measurement but keep it on screen (double-click). */
  endMeasure: () => void;
  /** Move one point of the measurement (drag-edit when the ruler is selected). */
  moveMeasurePoint: (i: number, world: LatLng) => void;
  /** Insert a measurement point on the nearest segment to `world`. */
  insertMeasurePointAt: (world: LatLng) => void;
  /** Remove one point of the measurement (keeps at least 2). */
  deleteMeasurePoint: (i: number) => void;
  /** Re-enter the measure tool to extend the existing measurement. */
  editMeasurement: () => void;
  clearMeasure: () => void;

  setCorridorWidth: (meters: number) => void;

  reset: () => void;
  /** Load world rings as objects (used by import). */
  loadWorldRings: (rings: Array<{ ring: LatLng[]; holes?: LatLng[][]; type?: EditorObjectType; fenceType?: 'inclusion' | 'exclusion' }>) => void;
  /** Ask the map to zoom to one object. */
  focusObject: (id: string) => void;
}

type Store = ObjectsState & ObjectsActions;

const TYPE_LABEL: Record<EditorObjectType, string> = {
  polygon: 'Area',
  corridor: 'Corridor',
  rectangle: 'Rectangle',
  circle: 'Circle',
};

/** Squared distance (m^2) from p to segment a-b, computed in a local frame at p. */
function pointSegDistSq(p: LatLng, a: LatLng, b: LatLng): number {
  const A = latLngToLocal(p, a); // a and b relative to p (which sits at the origin)
  const B = latLngToLocal(p, b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(A.x * dx + A.y * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = A.x + t * dx;
  const cy = A.y + t * dy;
  return cx * cx + cy * cy;
}

/** Replace the selected object via a transform; no-op if nothing selected. */
function mapSelected(state: ObjectsState, fn: (o: EditorObject) => EditorObject): EditorObject[] {
  if (state.selectedId === null) return state.objects;
  return state.objects.map((o) => (o.id === state.selectedId ? fn(o) : o));
}

export const useObjectsStore = create<Store>()(
  subscribeWithSelector((set, get) => ({
    objects: [],
    selectedId: null,
    focusRequest: null,
    tool: 'select',
    draftPoints: [],
    draftType: null,
    selectedVertex: null,
    measurePoints: [],
    measureDone: false,
    selectedMeasure: false,
    corridorWidthM: 60,
    nameSeq: 0,
    checkedIds: [],
    contextMenu: null,
    past: [],
    future: [],

    setTool: (tool) => {
      // Leaving a draw tool mid-draft discards the unfinished outline. The
      // measurement is NOT cleared on leave (it persists until Clear); picking
      // the measure tool starts a fresh one via the measureDone flag.
      set({
        tool,
        draftPoints: [],
        // 'branch' reuses the corridor draft (an open centerline); finishBranch
        // commits it onto the selected corridor instead of as a new object.
        draftType: tool === 'polygon' ? 'polygon' : (tool === 'corridor' || tool === 'spline' || tool === 'branch') ? 'corridor' : tool === 'hole' ? 'polygon' : null,
        selectedVertex: tool === 'edit' ? get().selectedVertex : null,
        measureDone: tool === 'measure' ? true : get().measureDone,
      });
    },

    selectObject: (id) => set({ selectedId: id, selectedVertex: null, selectedMeasure: false }),

    selectMeasure: () => set({ selectedMeasure: true, selectedId: null, selectedVertex: null }),

    pushHistory: () =>
      set((s) => ({ past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT), future: [] })),

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return {};
        // Return to a clean select state so we never strand the user in a draw/
        // cut tool (e.g. undoing right after picking "Cut hole").
        return { ...prev, ...NEUTRAL_TOOL_STATE, past: s.past.slice(0, -1), future: [...s.future, snapshot(s)].slice(-HISTORY_LIMIT) };
      }),

    redo: () =>
      set((s) => {
        const next = s.future[s.future.length - 1];
        if (!next) return {};
        return { ...next, ...NEUTRAL_TOOL_STATE, future: s.future.slice(0, -1), past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT) };
      }),

    toggleChecked: (id) =>
      set((s) => ({
        checkedIds: s.checkedIds.includes(id) ? s.checkedIds.filter((x) => x !== id) : [...s.checkedIds, id],
      })),
    setChecked: (ids) => set({ checkedIds: [...ids] }),
    clearChecked: () => set({ checkedIds: [] }),

    openContextMenu: (menu) => set({ contextMenu: menu }),
    closeContextMenu: () => set({ contextMenu: null }),

    duplicateObject: (id) => {
      const orig = get().objects.find((o) => o.id === id);
      if (!orig) return;
      get().pushHistory();
      // Offset the copy ~20 m south-east so it doesn't sit exactly on the original.
      const cloned = translateObject(cloneObject(orig, `${orig.name} copy`), -0.0002, 0.0002);
      // The workspace role is exclusive; the copy must not become a second workspace.
      const copy = cloned.role === 'workspace' ? { ...cloned, role: undefined } : cloned;
      set((s) => ({ objects: [...s.objects, copy], selectedId: copy.id, selectedVertex: null, selectedMeasure: false }));
    },

    addObject: (obj) => {
      get().pushHistory();
      set((s) => ({
        objects: [...s.objects, obj],
        selectedId: obj.id,
        tool: 'select',
        draftPoints: [],
        draftType: null,
      }));
    },

    replaceObject: (obj) =>
      set((s) => ({ objects: s.objects.map((o) => (o.id === obj.id ? obj : o)) })),

    addDraftPoint: (p) => {
      const { draftType } = get();
      if (draftType === null) return;
      set((s) => ({ draftPoints: [...s.draftPoints, p] }));
    },

    finishDraft: () => {
      const { draftType, draftPoints, corridorWidthM, nameSeq, tool } = get();
      if (draftType === null || draftPoints.length < minPointsForType(draftType)) {
        set({ draftPoints: [], draftType: null });
        return;
      }
      // Spline tool: the clicked points are control points, the corridor's
      // centerline is the smooth curve through them.
      const outline = tool === 'spline' && draftPoints.length >= 3
        ? catmullRomSpline(draftPoints)
        : draftPoints;
      const seq = nameSeq + 1;
      const obj = makeFromWorldRing(draftType, outline, `${tool === 'spline' ? 'Spline' : TYPE_LABEL[draftType]} ${seq}`, {
        ...(draftType === 'corridor' ? { corridorWidthM } : {}),
      });
      get().pushHistory();
      set((s) => ({
        objects: [...s.objects, obj],
        selectedId: obj.id,
        tool: 'select',
        draftPoints: [],
        draftType: null,
        nameSeq: seq,
      }));
    },

    finishHole: () => {
      const { draftPoints, selectedId, objects } = get();
      const sel = objects.find((o) => o.id === selectedId) ?? null;
      // Holes apply to closed areas (not the open corridor centerline).
      if (!sel || sel.type === 'corridor' || draftPoints.length < 3) {
        set({ draftPoints: [], draftType: null, tool: 'select' });
        return;
      }
      const ring = draftPoints.map((p) => worldToLocal(sel, p));
      // Clip the drawn hole to the area's outline so a hole that pokes past the
      // boundary (or spans onto neighbouring objects) is trimmed to the part
      // actually inside - storing a ring that crosses the outline triangulates
      // into garbage. A draw straddling the edge can yield several inside parts.
      const outerArea = Math.abs(localRingArea(sel.base));
      const pieces = clipRingToPolygon(ring, sel.base)
        .filter((h) => h.length >= 3 && Math.abs(localRingArea(h)) < outerArea * 0.999);
      if (pieces.length === 0) {
        set({ draftPoints: [], draftType: null, tool: 'select' });
        return;
      }
      get().pushHistory();
      // Cutting a hole makes the shape no longer a clean parametric rect/circle,
      // so promote it to a free polygon - that makes the outline AND the hole
      // vertex-editable (parametric outlines are otherwise locked).
      set((s) => ({
        objects: s.objects.map((o) =>
          o.id === sel.id ? { ...o, type: 'polygon', holes: [...o.holes, ...pieces] } : o,
        ),
        draftPoints: [],
        draftType: null,
        tool: 'select',
      }));
    },

    finishBranch: () => {
      const { draftPoints, selectedId, objects } = get();
      const sel = objects.find((o) => o.id === selectedId) ?? null;
      // Branches attach to a corridor centerline; need a corridor + >=2 points.
      if (!sel || sel.type !== 'corridor' || draftPoints.length < 2) {
        set({ draftPoints: [], draftType: null, tool: 'select' });
        return;
      }
      const local = draftPoints.map((p) => worldToLocal(sel, p));
      // Snap the branch's first vertex onto the nearest existing centerline — the
      // main line OR another branch (branches off branches).
      local[0] = snapToNearestPolyline(local[0]!, [sel.base, ...(sel.branches ?? [])]);
      get().pushHistory();
      set((s) => ({
        objects: s.objects.map((o) =>
          o.id === sel.id ? { ...o, branches: [...(o.branches ?? []), local] } : o,
        ),
        draftPoints: [],
        draftType: null,
        tool: 'select',
      }));
    },

    clearBranches: (id) => {
      const targetId = id ?? get().selectedId;
      if (targetId === null) return;
      const target = get().objects.find((o) => o.id === targetId);
      if (!target || !target.branches || target.branches.length === 0) return;
      get().pushHistory();
      set((s) => ({
        objects: s.objects.map((o) => {
          if (o.id !== targetId) return o;
          const { branches: _omit, ...rest } = o;
          return rest;
        }),
      }));
    },

    removeBranch: (id, index) => {
      const target = get().objects.find((o) => o.id === id);
      if (!target || !target.branches || index < 0 || index >= target.branches.length) return;
      get().pushHistory();
      set((s) => ({
        objects: s.objects.map((o) => {
          if (o.id !== id) return o;
          const branches = o.branches!.filter((_, i) => i !== index);
          if (branches.length === 0) {
            const { branches: _omit, ...rest } = o;
            return rest;
          }
          return { ...o, branches };
        }),
      }));
    },

    mergeCorridors: (id) => {
      const targetId = id ?? get().selectedId;
      const objects = get().objects;
      const target = objects.find((o) => o.id === targetId);
      if (!target || target.type !== 'corridor') return 0;

      const others = objects.filter(
        (o) => o.id !== target.id && o.type === 'corridor' && o.visible && o.base.length >= 2,
      );
      if (others.length === 0) return 0;

      // Each absorbed corridor comes in through world coordinates: they carry
      // their own origin and rotation, so its local frame means nothing here.
      const added: LocalPt[][] = [];
      for (const other of others) {
        for (const line of [objectWorldRing(other), ...objectWorldBranches(other)]) {
          if (line.length < 2) continue;
          const local: LocalPt[] = line.map((p) => worldToLocal(target, p));
          // Attach at whichever end sits nearer the network, so the junction
          // lands where the spur actually meets the line rather than at
          // whichever end happened to be drawn first.
          const lines = [target.base, ...(target.branches ?? []), ...added];
          const head = snapToNearestPolyline(local[0]!, lines);
          const tail = snapToNearestPolyline(local[local.length - 1]!, lines);
          const dHead = (head.x - local[0]!.x) ** 2 + (head.y - local[0]!.y) ** 2;
          const dTail = (tail.x - local[local.length - 1]!.x) ** 2 + (tail.y - local[local.length - 1]!.y) ** 2;
          if (dTail < dHead) {
            local.reverse();
            local[0] = tail;
          } else {
            local[0] = head;
          }
          added.push(local);
        }
      }
      if (added.length === 0) return 0;

      const absorbed = new Set(others.map((o) => o.id));
      get().pushHistory();
      set((s) => ({
        objects: s.objects
          .filter((o) => !absorbed.has(o.id))
          .map((o) => (o.id === target.id ? { ...o, branches: [...(o.branches ?? []), ...added] } : o)),
        selectedId: target.id,
      }));
      return others.length;
    },

    cancelDraft: () => set({ draftPoints: [], draftType: null }),

    translateSelected: (dLat, dLng) =>
      set((s) => ({ objects: mapSelected(s, (o) => translateObject(o, dLat, dLng)) })),

    rotateSelected: (deltaDeg) =>
      set((s) => ({ objects: mapSelected(s, (o) => rotateObject(o, deltaDeg)) })),

    scaleSelected: (sx, sy, anchor) =>
      set((s) => ({ objects: mapSelected(s, (o) => scaleObjectAbout(o, sx, sy, anchor)) })),

    renameObject: (id, name) => {
      get().pushHistory();
      set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, name } : o)) }));
    },

    setObjectColor: (id, color) => {
      get().pushHistory();
      set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, color } : o)) }));
    },

    setObjectFenceType: (id, fenceType) => {
      get().pushHistory();
      set((s) => ({
        objects: s.objects.map((o) =>
          o.id === id ? { ...o, fenceType: fenceType ?? undefined } : o,
        ),
      }));
    },

    setObjectRole: (id, role) => {
      get().pushHistory();
      set((s) => ({
        objects: s.objects.map((o) => {
          if (o.id === id) return { ...o, role: role ?? undefined };
          // Only one workspace at a time: granting the role strips it elsewhere.
          return role === 'workspace' && o.role === 'workspace' ? { ...o, role: undefined } : o;
        }),
      }));
    },

    mergeOverlapping: (id) => {
      const s = get();
      const target = s.objects.find((o) => o.id === id);
      if (!target || target.type === 'corridor' || target.fenceType || target.role) return 0;

      const toGeom = (o: EditorObject): PCPolygon => {
        const closeRing = (ring: LatLng[]): PCRing => {
          const pts: PCRing = ring.map((p) => [p.lng, p.lat]);
          return pts;
        };
        return [
          closeRing(objectWorldRing(o)),
          ...objectWorldHoles(o).map(closeRing),
        ];
      };

      const candidates = s.objects.filter(
        (o) =>
          o.id !== id &&
          o.type !== 'corridor' &&
          !o.fenceType &&
          !o.role &&
          o.visible &&
          objectWorldRing(o).length >= 3,
      );

      let mergedGeom: PCMultiPolygon = [toGeom(target)];
      const absorbed = new Set<string>([target.id]);
      // Repeat until fixpoint so A-B-C chains merge even when A and C don't touch.
      let changed = true;
      while (changed) {
        changed = false;
        for (const o of candidates) {
          if (absorbed.has(o.id)) continue;
          const g: PCMultiPolygon = [toGeom(o)];
          try {
            if (pcIntersection(mergedGeom, g).length === 0) continue;
            mergedGeom = pcUnion(mergedGeom, g);
          } catch {
            continue; // degenerate geometry: skip this candidate, keep merging others
          }
          absorbed.add(o.id);
          changed = true;
        }
      }
      if (absorbed.size <= 1) return 0;

      const fromPC = (ring: PCRing): LatLng[] => {
        const pts = ring.map(([lng, lat]) => ({ lat, lng }));
        // polygon-clipping closes its rings; editor rings are open.
        const first = pts[0];
        const last = pts[pts.length - 1];
        if (pts.length > 1 && first && last && first.lat === last.lat && first.lng === last.lng) pts.pop();
        return pts;
      };

      get().pushHistory();
      const replacements = mergedGeom
        .filter((poly) => (poly[0]?.length ?? 0) >= 4)
        .map((poly, i) => ({
          ...makeFromWorldRing(
            'polygon',
            fromPC(poly[0]!),
            mergedGeom.length > 1 ? `${target.name} merged ${i + 1}` : `${target.name} merged`,
            { holes: poly.slice(1).map(fromPC).filter((h) => h.length >= 3) },
          ),
          ...(target.color ? { color: target.color } : {}),
        }));
      if (replacements.length === 0) return 0;
      set((st) => ({
        objects: [...st.objects.filter((o) => !absorbed.has(o.id)), ...replacements],
        selectedId: replacements[0]!.id,
        selectedVertex: null,
        tool: 'select',
      }));
      return absorbed.size - 1;
    },

    deleteObject: (id) => {
      get().pushHistory();
      set((s) => ({
        objects: s.objects.filter((o) => o.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
        selectedVertex: s.selectedId === id ? null : s.selectedVertex,
      }));
    },

    deleteSelected: () => {
      const { selectedId } = get();
      if (selectedId !== null) get().deleteObject(selectedId);
    },

    toggleVisible: (id) => {
      get().pushHistory();
      set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, visible: !o.visible } : o)) }));
    },

    reorderObject: (id, dir) => {
      const objs = get().objects;
      const i = objs.findIndex((o) => o.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= objs.length) return;
      get().pushHistory();
      set((s) => {
        const next = [...s.objects];
        const a = next[i]!;
        const b = next[j]!;
        next[i] = b;
        next[j] = a;
        return { objects: next };
      });
    },

    convertSelectedToPolygon: () => {
      if (get().selectedId === null) return;
      get().pushHistory();
      set((s) => ({ objects: mapSelected(s, (o) => convertToPolygon(o)) }));
    },

    bufferSelected: (meters) => {
      if (get().selectedId === null) return;
      get().pushHistory();
      set((s) => ({ objects: mapSelected(s, (o) => bufferObject(o, meters) ?? o) }));
    },

    splitSelectedByLine: (p1, p2) => {
      const { selectedId, objects } = get();
      const trySplit = (o: EditorObject) => (o.type === 'corridor' ? null : splitObjectByLine(o, p1, p2));
      // Prefer the selected area; otherwise auto-target the first area the line
      // validly crosses, so the user doesn't have to select one first.
      let target = objects.find((o) => o.id === selectedId) ?? null;
      let parts = target ? trySplit(target) : null;
      if (!parts || parts.length === 0) {
        for (const o of objects) {
          const p = trySplit(o);
          if (p && p.length > 0) { target = o; parts = p; break; }
        }
      }
      if (!target || !parts || parts.length === 0) return; // no area crossed -> no-op
      get().pushHistory();
      const idx = objects.findIndex((o) => o.id === target!.id);
      const next = [...objects];
      next.splice(idx, 1, ...parts);
      set({ objects: next, selectedId: parts[0]!.id, selectedVertex: null, tool: 'select' });
    },

    selectVertex: (i) => set({ selectedVertex: i }),

    moveVertex: (i, world, branch = -1, hole = -1) =>
      set((s) =>
        ({
          objects: mapSelected(s, (o) => {
            const local = worldToLocal(o, world);
            if (hole >= 0) {
              const line = o.holes[hole];
              if (!line || i < 0 || i >= line.length) return o;
              const next = line.map((p, idx) => (idx === i ? local : p));
              return { ...o, holes: o.holes.map((h, hi) => (hi === hole ? next : h)) };
            }
            if (branch < 0) {
              if (i < 0 || i >= o.base.length) return o;
              return { ...o, base: o.base.map((p, idx) => (idx === i ? local : p)) };
            }
            const branches = o.branches ?? [];
            const line = branches[branch];
            if (!line || i < 0 || i >= line.length) return o;
            const next = line.map((p, idx) => (idx === i ? local : p));
            return { ...o, branches: branches.map((b, bi) => (bi === branch ? next : b)) };
          }),
        }),
      ),

    insertVertexAfter: (i, world, hole = -1) => {
      if (get().selectedId === null) return;
      get().pushHistory();
      set((s) =>
        ({
          objects: mapSelected(s, (o) => {
            const local = worldToLocal(o, world);
            if (hole >= 0) {
              const line = o.holes[hole];
              if (!line) return o;
              const next = [...line];
              next.splice(i + 1, 0, local);
              return { ...o, holes: o.holes.map((h, hi) => (hi === hole ? next : h)) };
            }
            const base = [...o.base];
            base.splice(i + 1, 0, local);
            return { ...o, base };
          }),
        }),
      );
    },

    deleteVertex: (i, branch = -1, hole = -1) => {
      if (get().selectedId === null) return;
      get().pushHistory();
      set((s) =>
        ({
          objects: mapSelected(s, (o) => {
            if (hole >= 0) {
              const line = o.holes[hole];
              if (!line) return o;
              // A hole needs 3 points; deleting below that drops the whole hole.
              if (line.length <= 3) return { ...o, holes: o.holes.filter((_, hi) => hi !== hole) };
              if (i < 0 || i >= line.length) return o;
              const next = line.filter((_, idx) => idx !== i);
              return { ...o, holes: o.holes.map((h, hi) => (hi === hole ? next : h)) };
            }
            if (branch < 0) {
              if (o.base.length <= minPointsForType(o.type)) return o;
              if (i < 0 || i >= o.base.length) return o;
              return { ...o, base: o.base.filter((_, idx) => idx !== i) };
            }
            const branches = o.branches ?? [];
            const line = branches[branch];
            if (!line) return o;
            // A branch needs 2 points; deleting below that drops the whole branch.
            if (line.length <= 2) {
              const rest = branches.filter((_, bi) => bi !== branch);
              if (rest.length === 0) { const { branches: _omit, ...r } = o; return r; }
              return { ...o, branches: rest };
            }
            if (i < 0 || i >= line.length) return o;
            const next = line.filter((_, idx) => idx !== i);
            return { ...o, branches: branches.map((b, bi) => (bi === branch ? next : b)) };
          }),
          selectedVertex: null,
        }),
      );
    },

    addMeasurePoint: (p) => {
      if (get().tool !== 'measure') return;
      // A finished measurement (or a freshly-picked measure tool) starts over
      // on the next click instead of extending the old line.
      set((s) => (s.measureDone ? { measurePoints: [p], measureDone: false } : { measurePoints: [...s.measurePoints, p] }));
    },
    endMeasure: () => { if (get().measurePoints.length >= 2) set({ measureDone: true }); },
    moveMeasurePoint: (i, world) =>
      set((s) => {
        if (i < 0 || i >= s.measurePoints.length) return {};
        return { measurePoints: s.measurePoints.map((p, idx) => (idx === i ? world : p)) };
      }),
    insertMeasurePointAt: (world) => {
      const pts = get().measurePoints;
      if (pts.length === 0) return;
      get().pushHistory();
      if (pts.length === 1) { set({ measurePoints: [...pts, world] }); return; }
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = pointSegDistSq(world, pts[i]!, pts[i + 1]!);
        if (d < bestD) { bestD = d; best = i; }
      }
      const next = [...pts];
      next.splice(best + 1, 0, world);
      set({ measurePoints: next });
    },
    deleteMeasurePoint: (i) => {
      const pts = get().measurePoints;
      if (pts.length <= 2 || i < 0 || i >= pts.length) return;
      get().pushHistory();
      set({ measurePoints: pts.filter((_, idx) => idx !== i) });
    },
    editMeasurement: () => set({ tool: 'measure', measureDone: false, selectedMeasure: false }),
    clearMeasure: () => {
      if (get().measurePoints.length > 0) get().pushHistory();
      set({ measurePoints: [], measureDone: false, selectedMeasure: false });
    },

    setCorridorWidth: (meters) => {
      const w = Math.max(1, meters);
      set((s) => ({
        corridorWidthM: w,
        objects: mapSelected(s, (o) => (o.type === 'corridor' ? { ...o, corridorWidthM: w } : o)),
      }));
    },

    reset: () =>
      set({
        objects: [],
        selectedId: null,
        tool: 'select',
        draftPoints: [],
        draftType: null,
        selectedVertex: null,
        measurePoints: [],
        measureDone: false,
        selectedMeasure: false,
        contextMenu: null,
        past: [],
        future: [],
      }),

    focusObject: (id) => {
      set((s) => ({ focusRequest: { id, seq: (s.focusRequest?.seq ?? 0) + 1 } }));
    },

    loadWorldRings: (rings) => {
      get().pushHistory();
      set((s) => {
        let seq = s.nameSeq;
        const objs = rings.map((r) => {
          const type = r.type ?? 'polygon';
          seq += 1;
          const obj = makeFromWorldRing(type, r.ring, `${TYPE_LABEL[type]} ${seq}`, { holes: r.holes ?? [] });
          return r.fenceType ? { ...obj, fenceType: r.fenceType } : obj;
        });
        const first = objs[0];
        return {
          objects: [...s.objects, ...objs],
          nameSeq: seq,
          selectedId: first ? first.id : s.selectedId,
          tool: 'select',
        };
      });
    },
  })),
);

// ── Autosave ─────────────────────────────────────────────────────────────────
// The editor runs in a detached window with pure in-memory state; before this,
// closing the window silently lost every drawn area. Objects are plain
// serializable data, so a debounced localStorage mirror is enough. Undo
// history and transient tool state are intentionally NOT persisted.

const AUTOSAVE_KEY = 'ardudeck:area-editor-autosave';
const AUTOSAVE_DEBOUNCE_MS = 800;

interface AutosavePayload {
  version: 1;
  objects: EditorObject[];
  nameSeq: number;
  corridorWidthM: number;
}

/**
 * Hydrate from the last autosave (only when the editor is empty, so a
 * mid-session HMR or double-init never clobbers live work), then mirror every
 * objects change back to localStorage. Returns an unsubscribe. `onSaved` fires
 * after each successful write so the UI can show a saved indicator.
 */
export function initAreaEditorAutosave(onSaved?: () => void): () => void {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw && useObjectsStore.getState().objects.length === 0) {
      const data = JSON.parse(raw) as AutosavePayload;
      if (data.version === 1 && Array.isArray(data.objects) && data.objects.length > 0) {
        useObjectsStore.setState({
          objects: data.objects,
          nameSeq: data.nameSeq ?? data.objects.length,
          corridorWidthM: data.corridorWidthM ?? 60,
        });
      }
    }
  } catch {
    // Corrupt autosave: start empty rather than crash the editor.
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useObjectsStore.subscribe(
    (s) => s.objects,
    (objects) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const s = useObjectsStore.getState();
        const payload: AutosavePayload = {
          version: 1,
          objects,
          nameSeq: s.nameSeq,
          corridorWidthM: s.corridorWidthM,
        };
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
          onSaved?.();
        } catch {
          // Quota/serialization failure: keep editing, autosave is best-effort.
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
  );
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}
