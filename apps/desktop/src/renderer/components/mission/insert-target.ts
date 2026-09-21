/**
 * Which mission leg a right-click on the map meant, and where on it.
 *
 * The old answer came from a per-leg invisible polyline 20px wide: Leaflet
 * handed the event to whichever of those bands happened to be on top, which on
 * a survey's parallel legs is rarely the one under the cursor, and the new
 * waypoint landed at the raw cursor position rather than on the line. This
 * resolves the leg geometrically and snaps to it, in screen space so the
 * tolerance is the same pixel distance at every zoom.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface LegPoint {
  seq: number;
  latitude: number;
  longitude: number;
  groupId?: string;
}

export interface InsertTarget {
  /** Insert the new item at afterSeq + 1. */
  afterSeq: number;
  /** Point snapped onto the leg. */
  lat: number;
  lon: number;
  /** Screen distance from the cursor to the leg, px. */
  distancePx: number;
  /** Group both ends of the leg share, if they share one. */
  groupId?: string;
  /** Position along the leg, 0 at the start and 1 at the end. */
  t: number;
}

/** Closest point on segment ab to p, as a 0..1 fraction along ab. */
export function projectOnSegment(p: Pt, a: Pt, b: Pt): { t: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return { t, distance: Math.hypot(p.x - cx, p.y - cy) };
}

/**
 * The leg nearest `cursor`, or null when none is within `maxPx`.
 *
 * `project` turns a position into screen px; ties go to the earlier leg so a
 * click on a shared waypoint inserts into the leg the aircraft flies first.
 */
export function nearestLeg(
  waypoints: readonly LegPoint[],
  cursor: Pt,
  project: (lat: number, lon: number) => Pt,
  maxPx: number,
): InsertTarget | null {
  if (waypoints.length < 2) return null;

  let best: (InsertTarget & { index: number }) | null = null;
  let a = project(waypoints[0]!.latitude, waypoints[0]!.longitude);

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!;
    const to = waypoints[i + 1]!;
    const b = project(to.latitude, to.longitude);
    const { t, distance } = projectOnSegment(cursor, a, b);
    if (distance <= maxPx && (best === null || distance < best.distancePx)) {
      best = {
        index: i,
        afterSeq: from.seq,
        // Interpolating the coordinates rather than unprojecting the screen
        // point keeps the insert exactly on the leg the list draws.
        lat: from.latitude + (to.latitude - from.latitude) * t,
        lon: from.longitude + (to.longitude - from.longitude) * t,
        distancePx: distance,
        groupId: from.groupId && from.groupId === to.groupId ? from.groupId : undefined,
        t,
      };
    }
    a = b;
  }

  if (!best) return null;
  const { index: _index, ...target } = best;
  return target;
}
