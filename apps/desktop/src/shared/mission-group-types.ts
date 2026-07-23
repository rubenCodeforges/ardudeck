/**
 * Mission Group Types
 *
 * Groups are the persistent containers for mission waypoints. Every waypoint
 * belongs to exactly one group. Groups carry their type (manual / survey /
 * imported) and, for survey groups, the polygon + generator config that
 * produced the waypoints.
 *
 * Spec: docs/superpowers/specs/2026-05-28-mission-groups-design.md
 *
 * Transitional note (PR 1): WP.groupId is typed as optional on MissionItem
 * during the structural rollout but is always set in practice by the
 * mission-store and migration. A later PR tightens the type once every
 * creation site has been migrated.
 */

export type GroupId = string;

export type GroupKind = 'manual' | 'survey' | 'imported';

/**
 * Color palette assigned to groups in creation order.
 * Chosen for legibility on the dark theme (zinc/gray bg) and distinct enough
 * from the segment-color palette in mission-segment-colors.ts to avoid
 * confusing "this WP is in group X" with "this leg is amber for camera".
 */
export const GROUP_COLOR_PALETTE: readonly string[] = [
  '#38bdf8', // sky-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f472b6', // pink-400
  '#818cf8', // indigo-400
  '#2dd4bf', // teal-400
  '#fb7185', // rose-400
  '#a3e635', // lime-400
];

interface BaseGroup {
  id: GroupId;
  name: string;
  kind: GroupKind;
  color: string;
  /**
   * Whether the group is shown on the map (polygon + WPs + path). Persisted.
   * Upload is a per-group action (or the single-group toolbar upload); it is
   * NOT gated by this flag.
   */
  visible: boolean;
  /** UI collapse state. Persisted so reopening a mission feels stable. */
  collapsed: boolean;
  /** Explicit ordering. Drag-reorder updates this. Lower values render first. */
  order: number;
  /**
   * Fleet/swarm: the vehicle this group's waypoints are intended for. Drives
   * the per-group "upload to vehicle" target and the per-vehicle colouring of
   * waypoints on the telemetry map. Undefined = unassigned (uses the group's
   * own colour and uploads to the active/primary vehicle).
   */
  assignedVehicleKey?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ManualGroup extends BaseGroup {
  kind: 'manual';
}

export interface SurveyGroup extends BaseGroup {
  kind: 'survey';
  generatorId: string;
  generatorVersion: string;
  /** Exterior boundary of the ROI in LatLng order. */
  polygon: Array<{ lat: number; lng: number }>;
  /** Optional no-fly zones inside the ROI. */
  holes?: Array<Array<{ lat: number; lng: number }>>;
  /** Optional workspace polygon (allowed flight area, may exceed ROI). */
  workspace?: Array<{ lat: number; lng: number }>;
  /** Generator-specific config blob. The generator owns the schema. */
  config: Record<string, unknown>;
  lastGeneratedAt: number | null;
  /** Hash of polygon + holes + workspace + config from the last generation. */
  lastGeneratedSignature: string | null;
  /**
   * Generator-specific cached extras (e.g. TOPAS decomposition / cells /
   * tracks). Opaque to the host; preserved byte-perfect across save/load so
   * an uninstalled module's data survives.
   */
  generatorResult: unknown;
}

export interface ImportedGroup extends BaseGroup {
  kind: 'imported';
  importedFrom: 'fc' | 'file';
  importedAt: number;
  sourceLabel: string;
}

export type Group = ManualGroup | SurveyGroup | ImportedGroup;

/**
 * Serializable snapshot of the mission store's authored content, mirrored from
 * the primary window to detached pop-outs over IPC (see IPC_CHANNELS.MISSION_
 * MIRROR). Carries everything a read-only view needs to render the mission;
 * `currentSeq` is intentionally excluded (it flows live via MISSION_CURRENT and
 * would otherwise flood the channel during AUTO). `items` is typed loosely as
 * unknown[] here to avoid importing MissionItem (which would couple this
 * import-free module); consumers cast to MissionItem[] at the boundary.
 */
export interface MissionMirrorSnapshot {
  items: unknown[];
  groups: Group[];
  home: { lat: number; lon: number; alt: number } | null;
  fcSeqOffset: number;
}

export function isManualGroup(g: Group): g is ManualGroup {
  return g.kind === 'manual';
}

export function isSurveyGroup(g: Group): g is SurveyGroup {
  return g.kind === 'survey';
}

export function isImportedGroup(g: Group): g is ImportedGroup {
  return g.kind === 'imported';
}

/**
 * Pick the next color from the palette, cycling once exhausted. Stable enough
 * for typical use (under ~10 groups) without needing rebalancing.
 */
export function nextGroupColor(existing: ReadonlyArray<Group>): string {
  const usedCounts = new Map<string, number>();
  for (const c of GROUP_COLOR_PALETTE) usedCounts.set(c, 0);
  for (const g of existing) {
    if (usedCounts.has(g.color)) usedCounts.set(g.color, usedCounts.get(g.color)! + 1);
  }
  // Walk the palette in order, return the first least-used color.
  let best = GROUP_COLOR_PALETTE[0]!;
  let bestCount = Infinity;
  for (const c of GROUP_COLOR_PALETTE) {
    const n = usedCounts.get(c)!;
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Generate a UUID using the platform's crypto. Available in modern Electron
 * renderer + main and works in test environments via Node's webcrypto.
 */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: time + random. Sufficient for in-memory group ids when crypto
  // is unavailable; never serialized as a security-bearing identifier.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateManualGroupOptions {
  name?: string;
  color?: string;
  order?: number;
  visible?: boolean;
}

export function createManualGroup(opts: CreateManualGroupOptions = {}): ManualGroup {
  const now = Date.now();
  return {
    id: uuid(),
    kind: 'manual',
    name: opts.name ?? 'Manual',
    color: opts.color ?? GROUP_COLOR_PALETTE[0]!,
    visible: opts.visible ?? true,
    collapsed: false,
    order: opts.order ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface CreateImportedGroupOptions {
  name?: string;
  color?: string;
  order?: number;
  importedFrom: 'fc' | 'file';
  sourceLabel: string;
}

export function createImportedGroup(opts: CreateImportedGroupOptions): ImportedGroup {
  const now = Date.now();
  return {
    id: uuid(),
    kind: 'imported',
    name: opts.name ?? opts.sourceLabel,
    color: opts.color ?? GROUP_COLOR_PALETTE[0]!,
    visible: true,
    collapsed: false,
    order: opts.order ?? 0,
    importedFrom: opts.importedFrom,
    importedAt: now,
    sourceLabel: opts.sourceLabel,
    createdAt: now,
    updatedAt: now,
  };
}

export interface CreateSurveyGroupOptions {
  name: string;
  generatorId: string;
  generatorVersion: string;
  polygon: Array<{ lat: number; lng: number }>;
  holes?: Array<Array<{ lat: number; lng: number }>>;
  workspace?: Array<{ lat: number; lng: number }>;
  config: Record<string, unknown>;
  color?: string;
  order?: number;
}

export function createSurveyGroup(opts: CreateSurveyGroupOptions): SurveyGroup {
  const now = Date.now();
  return {
    id: uuid(),
    kind: 'survey',
    name: opts.name,
    color: opts.color ?? GROUP_COLOR_PALETTE[0]!,
    visible: true,
    collapsed: false,
    order: opts.order ?? 0,
    generatorId: opts.generatorId,
    generatorVersion: opts.generatorVersion,
    polygon: opts.polygon,
    holes: opts.holes,
    workspace: opts.workspace,
    config: opts.config,
    lastGeneratedAt: null,
    lastGeneratedSignature: null,
    generatorResult: null,
    createdAt: now,
    updatedAt: now,
  };
}
