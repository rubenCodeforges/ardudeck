/** Pure model of docked instrument groups; the store applies the results. */
import type { DockOrientation } from './dock-snap';

export interface DockGroup {
  members: string[];
  orientation: DockOrientation;
  /** 'cluster' = free-form constellation around the ball. Absent = card
   * group; a card group MAY also contain the ball (contoured chrome). */
  kind?: 'cluster';
  /** Card groups only: span the panel edge-to-edge along the main axis
   * (a row becomes a full-width bar, a column a full-height rail). */
  stretch?: boolean;
  /** Cluster only: member top-left px relative to the anchor's top-left.
   * The anchor itself has no entry (it IS the origin). */
  offsets?: Record<string, { x: number; y: number }>;
}

export type DockGroups = Record<string, DockGroup>;

export const GROUP_KEY_PREFIX = 'group:';

/** The attitude ball anchors free-form constellations instead of boxed cards. */
export const CLUSTER_ANCHOR = 'attitude';

export function isCluster(g: DockGroup): boolean {
  // Legacy persisted clusters predate the kind flag; they always carried
  // offsets, which a card group never does.
  return g.kind === 'cluster' || (g.offsets !== undefined && g.members.includes(CLUSTER_ANCHOR));
}

export function groupOverlayKey(gid: string): string {
  return 'instrument:' + GROUP_KEY_PREFIX + gid;
}

export function nextGroupId(groups: DockGroups): string {
  let n = 1;
  while (`d${n}` in groups) n++;
  return `d${n}`;
}

export function groupOf(groups: DockGroups, memberId: string): string | null {
  for (const [gid, g] of Object.entries(groups)) {
    if (g.members.includes(memberId)) return gid;
  }
  return null;
}

function sanitizeOffsets(parsed: unknown, members: string[]): Record<string, { x: number; y: number }> | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, raw] of Object.entries(parsed as Record<string, unknown>)) {
    const o = raw as { x?: unknown; y?: unknown } | null;
    if (members.includes(id) && id !== CLUSTER_ANCHOR && o && Number.isFinite(o.x) && Number.isFinite(o.y)) {
      out[id] = { x: o.x as number, y: o.y as number };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeGroups(parsed: unknown, knownIds: readonly string[]): DockGroups {
  const out: DockGroups = {};
  if (!parsed || typeof parsed !== 'object') return out;
  const seen = new Set<string>();
  for (const [gid, raw] of Object.entries(parsed as Record<string, unknown>)) {
    const g = raw as { members?: unknown; orientation?: unknown; offsets?: unknown } | null;
    if (!g || !Array.isArray(g.members)) continue;
    const members = g.members.filter(
      (m): m is string => typeof m === 'string' && knownIds.includes(m) && !seen.has(m),
    );
    if (members.length < 2) continue;
    // A cluster whose ball entry was pruned (unknown/duplicate) is malformed.
    const wasCluster = (g as { kind?: unknown }).kind === 'cluster'
      || ((g as { offsets?: unknown }).offsets !== undefined && g.members.includes(CLUSTER_ANCHOR));
    if (wasCluster && !members.includes(CLUSTER_ANCHOR)) continue;
    members.forEach((m) => seen.add(m));
    const offsets = wasCluster ? sanitizeOffsets(g.offsets, members) : undefined;
    out[gid] = {
      members,
      orientation: g.orientation === 'col' ? 'col' : 'row',
      ...(wasCluster ? { kind: 'cluster' as const } : {}),
      ...(!wasCluster && (g as { stretch?: unknown }).stretch === true ? { stretch: true } : {}),
      ...(offsets ? { offsets } : {}),
    };
  }
  return out;
}

export function createGroup(
  groups: DockGroups,
  targetId: string,
  draggedId: string,
  orientation: DockOrientation,
  draggedFirst: boolean,
): { groups: DockGroups; gid: string } {
  const gid = nextGroupId(groups);
  const members = draggedFirst ? [draggedId, targetId] : [targetId, draggedId];
  return { groups: { ...groups, [gid]: { members, orientation } }, gid };
}

export function createCluster(
  groups: DockGroups,
  otherId: string,
  offset: { x: number; y: number },
): { groups: DockGroups; gid: string } {
  const gid = nextGroupId(groups);
  return {
    groups: {
      ...groups,
      [gid]: { members: [CLUSTER_ANCHOR, otherId], orientation: 'row', kind: 'cluster', offsets: { [otherId]: offset } },
    },
    gid,
  };
}

export function addClusterMember(
  groups: DockGroups,
  gid: string,
  id: string,
  offset: { x: number; y: number },
): DockGroups {
  const g = groups[gid];
  if (!g || !isCluster(g) || g.members.includes(id)) return groups;
  return {
    ...groups,
    [gid]: { ...g, members: [...g.members, id], offsets: { ...(g.offsets ?? {}), [id]: offset } },
  };
}

export function setClusterOffset(
  groups: DockGroups,
  gid: string,
  id: string,
  offset: { x: number; y: number },
): DockGroups {
  const g = groups[gid];
  if (!g || !isCluster(g) || !g.members.includes(id) || id === CLUSTER_ANCHOR) return groups;
  return { ...groups, [gid]: { ...g, offsets: { ...(g.offsets ?? {}), [id]: offset } } };
}

export function dissolveGroup(groups: DockGroups, gid: string): DockGroups {
  if (!(gid in groups)) return groups;
  const next = { ...groups };
  delete next[gid];
  return next;
}

export function addMember(groups: DockGroups, gid: string, id: string, index: number): DockGroups {
  const g = groups[gid];
  if (!g || g.members.includes(id)) return groups;
  const members = [...g.members];
  members.splice(Math.max(0, Math.min(members.length, index)), 0, id);
  return { ...groups, [gid]: { ...g, members } };
}

/**
 * One card group absorbs another: the target keeps its identity, orientation
 * and position; the dragged group's members join at the near end and the
 * dragged group dissolves. Clusters never merge (the ball anchors its own
 * formation).
 */
export function mergeGroups(groups: DockGroups, targetGid: string, draggedGid: string, atStart: boolean): DockGroups {
  const target = groups[targetGid];
  const dragged = groups[draggedGid];
  if (!target || !dragged || targetGid === draggedGid) return groups;
  if (isCluster(target) || isCluster(dragged)) return groups;
  const members = atStart
    ? [...dragged.members, ...target.members]
    : [...target.members, ...dragged.members];
  const next = { ...groups, [targetGid]: { ...target, members } };
  delete next[draggedGid];
  return next;
}

export interface RemoveResult {
  groups: DockGroups;
  /** Set when the group shrank to one member and dissolved. */
  dissolved: { gid: string; remaining: string } | null;
}

export function removeMember(groups: DockGroups, id: string): RemoveResult {
  const gid = groupOf(groups, id);
  if (!gid) return { groups, dissolved: null };
  const g = groups[gid]!;
  const members = g.members.filter((m) => m !== id);
  const next = { ...groups };
  if (members.length < 2) {
    delete next[gid];
    return { groups: next, dissolved: { gid, remaining: members[0]! } };
  }
  let offsets = g.offsets;
  if (offsets && id in offsets) {
    const { [id]: _gone, ...rest } = offsets;
    offsets = Object.keys(rest).length > 0 ? rest : undefined;
  }
  next[gid] = { ...g, members, ...(offsets ? { offsets } : { offsets: undefined }) };
  return { groups: next, dissolved: null };
}

interface DisplayCapable {
  id: string;
  NumericComponent?: unknown;
  variants?: Array<{ id: string; labelKey?: string }>;
}

function modesOf(def: DisplayCapable): string[] {
  return ['analog', ...(def.NumericComponent ? ['numeric'] : []), ...(def.variants ?? []).map((v) => v.id)];
}

/**
 * Display modes a whole group can switch to together. Offered only when EVERY
 * member can follow (single-look members like mission or RTK would make the
 * switch restyle a fraction of the group, which reads as broken); the ball is
 * exempt in a constellation since it is the anchor, not a readout.
 */
export function groupDisplayOptions(members: DisplayCapable[]): { ids: string[]; options: Array<{ id: string; labelKey: string }> } | null {
  const relevant = members.filter((d) => d.id !== CLUSTER_ANCHOR);
  if (relevant.length === 0 || !relevant.every((d) => modesOf(d).length > 1)) return null;
  let common = modesOf(relevant[0]!);
  for (const d of relevant.slice(1)) {
    const own = new Set(modesOf(d));
    common = common.filter((m) => own.has(m));
  }
  if (common.length < 2) return null;
  const labels = new Map<string, string>([['analog', 'map:instrumentDisplay.analog'], ['numeric', 'map:instrumentDisplay.numeric']]);
  for (const d of relevant) for (const v of d.variants ?? []) if (!labels.has(v.id) && v.labelKey) labels.set(v.id, v.labelKey);
  return { ids: relevant.map((d) => d.id), options: common.map((id) => ({ id, labelKey: labels.get(id) ?? id })) };
}

export function reorderMember(groups: DockGroups, gid: string, from: number, to: number): DockGroups {
  const g = groups[gid];
  if (!g || from === to || from < 0 || from >= g.members.length) return groups;
  const members = [...g.members];
  const [moved] = members.splice(from, 1);
  members.splice(Math.max(0, Math.min(members.length, to)), 0, moved!);
  return { ...groups, [gid]: { ...g, members } };
}
