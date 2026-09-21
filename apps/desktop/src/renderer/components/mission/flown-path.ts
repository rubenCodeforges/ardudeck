/**
 * The track the aircraft will actually fly, and where that costs coverage.
 *
 * A mission is a list of points; a plane is not. ArduPlane's L1/NPFG
 * controller starts each turn early and curves through the corner, with the
 * radius set by airspeed and bank angle (WP_RADIUS bounds how early). So the
 * straight line drawn between waypoints is not where the aircraft goes, and at
 * a sharp bend in a corridor it can pass well inside the line.
 *
 * That matters to a survey pilot for one reason: if the aircraft cuts the bend
 * by more than half the swath width, the camera never sees the ground it was
 * sent to photograph, and the whole leg gets re-flown. This predicts the track
 * so the gap is visible at planning time instead of in the processed data.
 */

import type { LatLng } from '../survey/survey-types';

const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (lat: number): number => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Level-turn radius: r = v² / (g·tan φ). 30° bank is the usual planning case. */
export function turnRadiusFor(speedMs: number, bankDeg = 30): number {
  const v = Math.max(1, speedMs);
  return (v * v) / (9.81 * Math.tan((bankDeg * Math.PI) / 180));
}

export interface CornerCut {
  /** Index of the waypoint the aircraft cuts past. */
  index: number;
  /** How far inside the corner the track passes, metres. */
  deviationM: number;
  /** Heading change at the corner, degrees. */
  turnDeg: number;
}

export interface FlownPath {
  /** The predicted track, dense through the turns. */
  path: LatLng[];
  /** Corners the aircraft cannot hold, worst first. */
  cuts: CornerCut[];
}

/**
 * Predict the flown track by rounding each corner with an arc of `radiusM`,
 * tangent to both legs, which is what turning early and rejoining produces.
 *
 * Where a leg is too short to fit the arc the radius is reduced to what fits:
 * the aircraft cannot do better either, it simply tracks wide.
 */
export function predictFlownPath(waypoints: readonly LatLng[], radiusM: number): FlownPath {
  if (waypoints.length < 3 || radiusM <= 0) {
    return { path: [...waypoints], cuts: [] };
  }

  const origin = waypoints[0]!;
  const kx = mPerDegLon(origin.lat);
  const toXY = (p: LatLng) => ({ x: (p.lng - origin.lng) * kx, y: (p.lat - origin.lat) * M_PER_DEG_LAT });
  const toLL = (x: number, y: number): LatLng => ({ lat: origin.lat + y / M_PER_DEG_LAT, lng: origin.lng + x / kx });

  const pts = waypoints.map(toXY);
  const path: LatLng[] = [waypoints[0]!];
  const cuts: CornerCut[] = [];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const v1x = cur.x - prev.x;
    const v1y = cur.y - prev.y;
    const v2x = next.x - cur.x;
    const v2y = next.y - cur.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;

    const u1x = v1x / l1;
    const u1y = v1y / l1;
    const u2x = v2x / l2;
    const u2y = v2y / l2;
    const dot = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
    const turn = Math.acos(dot);
    // Below a couple of degrees the aircraft simply tracks the line.
    if (turn < 0.035) { path.push(waypoints[i]!); continue; }

    const halfOuter = (Math.PI - turn) / 2;
    const wanted = radiusM / Math.tan(halfOuter);
    const t = Math.min(wanted, l1 / 2, l2 / 2);
    if (t < 0.5) { path.push(waypoints[i]!); continue; }
    const r = t * Math.tan(halfOuter);

    const start = { x: cur.x - u1x * t, y: cur.y - u1y * t };
    const end = { x: cur.x + u2x * t, y: cur.y + u2y * t };
    // Centre lies along the inner bisector at hypot(t, r) from the corner.
    let bx = u2x - u1x;
    let by = u2y - u1y;
    const blen = Math.hypot(bx, by) || 1;
    bx /= blen;
    by /= blen;
    const h = Math.hypot(t, r);
    const cx = cur.x + bx * h;
    const cy = cur.y + by * h;

    // The corner is missed by the gap between it and the arc's apex.
    const deviation = h - r;
    if (deviation > 0.5) {
      cuts.push({ index: i, deviationM: deviation, turnDeg: (turn * 180) / Math.PI });
    }

    const a0 = Math.atan2(start.y - cy, start.x - cx);
    const a1 = Math.atan2(end.y - cy, end.x - cx);
    let sweep = a1 - a0;
    while (sweep <= -Math.PI) sweep += 2 * Math.PI;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;

    const steps = Math.max(2, Math.min(12, Math.ceil(Math.abs(sweep) / 0.35)));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (sweep * k) / steps;
      path.push(toLL(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  }

  path.push(waypoints[waypoints.length - 1]!);
  cuts.sort((a, b) => b.deviationM - a.deviationM);
  return { path, cuts };
}

/**
 * Corners where the track leaves the mapped swath, so the camera misses ground
 * the plan claims to cover. Half the swath either side of the line is what the
 * camera sees, so a cut deeper than that is a hole in the survey.
 */
export function coverageGaps(cuts: readonly CornerCut[], swathWidthM: number): CornerCut[] {
  const limit = swathWidthM / 2;
  return cuts.filter((c) => c.deviationM > limit);
}
