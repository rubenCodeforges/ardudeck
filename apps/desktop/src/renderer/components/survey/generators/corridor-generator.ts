/**
 * Corridor Pattern Generator
 *
 * Linear surveys that follow a path rather than fill an area: roads, railways,
 * power lines, pipelines, motorways. The drawn polygon is interpreted as an
 * open CENTERLINE (the line the corridor follows), not a closed region.
 *
 * Algorithm:
 * 1. Treat config.polygon as an ordered, open centerline (optionally reversed
 *    by invertPath).
 * 2. Compute line spacing from the camera/overlap (or the manual corridor
 *    width for ground vehicles).
 * 3. Derive the strip count from corridorWidth / lineSpacing, unless
 *    corridorStrips forces an explicit (even or odd) count. Lay the strips out
 *    symmetrically around the centerline (+ optional corridorSideOffset).
 * 4. Offset the centerline laterally to produce each strip polyline.
 * 5. Connect strips boustrophedon (alternate direction). flipLegs reverses the
 *    order the strips are flown in.
 * 6. Plane mode only: insert racetrack turn waypoints at centerline bends
 *    sharper than maxTurnAngle, and extend each strip's ends by the overshoot
 *    so the aircraft has room to turn. Copter mode turns on the spot, so it
 *    skips both.
 * 7. Sample photo positions + footprints along each strip (camera mode).
 *
 * Branched corridors (a main axis with side spurs: forked roads, power-line
 * taps, river tributaries) are supported via `config.corridorBranches`: each
 * branch is a further open centerline, generated with this same strip algorithm
 * and flown after the main centerline, in the order and direction that keeps
 * the dead legs between runs shortest (see corridor-route). They share the
 * corridor's width/overlap/camera settings. Junctions are visual only and some overlap at a
 * fork is accepted, which matches every other corridor tool (UgCS, QGC,
 * DroneDeploy, Pix4D) - those force the operator to manage disconnected routes
 * by hand instead of keeping the branches in one corridor object.
 */
import type { LatLng, SurveyConfig, SurveyResult, SurveyStats } from '../survey-types';
import { latLngToLocal, localToLatLng, polygonCentroid, distanceLatLng } from '../geo-math';
import { getEffectiveFootprint, getEffectiveSpacing } from '../survey-stats';
import { orderCorridorRuns } from './corridor-route';

interface XY {
  x: number;
  y: number;
}

function unit(dx: number, dy: number): XY {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Left-hand unit normal at each vertex of an open polyline. Interior vertices
 * average the normals of their two adjacent edges; endpoints take their single
 * edge's normal. Used to offset the centerline into parallel strips.
 */
function vertexNormals(path: XY[]): XY[] {
  const n = path.length;
  const normals: XY[] = [];
  for (let i = 0; i < n; i++) {
    let nx = 0;
    let ny = 0;
    if (i > 0) {
      const d = unit(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
      nx += -d.y;
      ny += d.x;
    }
    if (i < n - 1) {
      const d = unit(path[i + 1]!.x - path[i]!.x, path[i + 1]!.y - path[i]!.y);
      nx += -d.y;
      ny += d.x;
    }
    const len = Math.hypot(nx, ny) || 1;
    normals.push({ x: nx / len, y: ny / len });
  }
  return normals;
}

function offsetPath(path: XY[], normals: XY[], distance: number): XY[] {
  return path.map((p, i) => ({
    x: p.x + normals[i]!.x * distance,
    y: p.y + normals[i]!.y * distance,
  }));
}

/**
 * Plane turn handling. At each interior vertex whose heading change exceeds
 * maxTurnDeg, insert two waypoints: one overshooting past the corner along the
 * incoming heading, one backed up along the outgoing heading. The aircraft
 * overshoots, turns wide, and re-enters the next leg aligned instead of cutting
 * the corner. These are the "overlapping waypoints so the plane flies a loop
 * turn" a fixed wing needs at sharp corridor bends.
 */
function applyTurnLoops(path: XY[], maxTurnDeg: number, radius: number): XY[] {
  if (path.length < 3 || radius <= 0) return path;
  const maxTurnRad = (maxTurnDeg * Math.PI) / 180;
  const out: XY[] = [path[0]!];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1]!;
    const cur = path[i]!;
    const next = path[i + 1]!;
    const di = unit(cur.x - prev.x, cur.y - prev.y);
    const dout = unit(next.x - cur.x, next.y - cur.y);
    const dot = Math.max(-1, Math.min(1, di.x * dout.x + di.y * dout.y));
    const turn = Math.acos(dot);
    out.push(cur);
    if (turn > maxTurnRad) {
      out.push({ x: cur.x + di.x * radius, y: cur.y + di.y * radius });
      out.push({ x: cur.x - dout.x * radius, y: cur.y - dout.y * radius });
    }
  }
  out.push(path[path.length - 1]!);
  return out;
}

/** Extend the first and last segment of a strip outward by `overshoot` meters. */
function extendEnds(strip: XY[], overshoot: number): XY[] {
  if (strip.length < 2 || overshoot <= 0) return strip;
  const a0 = strip[0]!;
  const a1 = strip[1]!;
  const dStart = unit(a0.x - a1.x, a0.y - a1.y);
  const start: XY = { x: a0.x + dStart.x * overshoot, y: a0.y + dStart.y * overshoot };
  const bN = strip[strip.length - 1]!;
  const bP = strip[strip.length - 2]!;
  const dEnd = unit(bN.x - bP.x, bN.y - bP.y);
  const end: XY = { x: bN.x + dEnd.x * overshoot, y: bN.y + dEnd.y * overshoot };
  return [start, ...strip, end];
}

/** Sample a polyline at fixed spacing, returning each point and its heading. */
function samplePolyline(path: XY[], spacing: number): { pt: XY; heading: number }[] {
  const out: { pt: XY; heading: number }[] = [];
  if (path.length < 2 || spacing <= 0) return out;
  let dist = 0;
  let next = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;
    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    const heading = Math.atan2(uy, ux);
    while (next <= dist + segLen + 1e-9) {
      const t = next - dist;
      out.push({ pt: { x: a.x + ux * t, y: a.y + uy * t }, heading });
      next += spacing;
    }
    dist += segLen;
  }
  return out;
}

function footprintRect(
  origin: LatLng,
  center: XY,
  heading: number,
  halfAlong: number,
  halfAcross: number,
): LatLng[] {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  // (along, across) corners; along = travel direction, across = perpendicular.
  const corners: [number, number][] = [
    [-halfAlong, -halfAcross],
    [halfAlong, -halfAcross],
    [halfAlong, halfAcross],
    [-halfAlong, halfAcross],
  ];
  return corners.map(([a, c]) => {
    const x = center.x + a * cos - c * sin;
    const y = center.y + a * sin + c * cos;
    return localToLatLng(origin, x, y);
  });
}

function emptyStats(config: SurveyConfig): SurveyStats {
  return {
    gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
    lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
    lineSpacing: 0, photoSpacing: 0,
  };
}

/**
 * Generate strips for a SINGLE centerline. `generateCorridor` runs this over the
 * main centerline plus any branches and concatenates the results.
 */
function generateOneCorridor(config: SurveyConfig, centerline: LatLng[]): SurveyResult {
  const { camera, altitude, frontOverlap, sideOverlap, speed } = config;

  // A corridor needs at least two centerline points to define a direction.
  if (centerline.length < 2) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  const isManual = !!(camera.manualCorridorWidth && camera.manualCorridorWidth > 0);
  const mode = config.corridorMode ?? 'plane';
  const planeTurns = mode === 'plane' && !isManual;

  // Centerline in local meters, optionally reversed.
  const centerSource = config.invertPath ? [...centerline].reverse() : centerline;
  const origin = polygonCentroid(centerline);
  const centerLocal: XY[] = centerSource.map((v) => latLngToLocal(origin, v));

  const { width: footprintW, height: footprintH } = getEffectiveFootprint(camera, altitude);
  const { lineSpacing, photoSpacing } = getEffectiveSpacing(
    camera, footprintW, footprintH, frontOverlap, sideOverlap,
  );
  if (lineSpacing <= 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Strip count: explicit override, otherwise derived from the swath width.
  const width = config.corridorWidth ?? 60;
  const explicit = config.corridorStrips ?? 0;
  const nStrips = explicit > 0
    ? Math.min(40, explicit)
    : Math.max(1, Math.min(40, Math.ceil(width / lineSpacing)));

  // Lateral offsets, centered on the centerline (+ side-offset bias). An odd
  // count puts one strip on the centerline; an even count straddles it.
  const half = (nStrips - 1) / 2;
  const sideOffset = config.corridorSideOffset ?? 0;
  const offsets: number[] = [];
  for (let i = 0; i < nStrips; i++) offsets.push((i - half) * lineSpacing + sideOffset);

  const order: number[] = [];
  for (let i = 0; i < nStrips; i++) order.push(i);
  if (config.flipLegs) order.reverse();

  const normals = vertexNormals(centerLocal);
  const overshoot = planeTurns ? config.overshoot : 0;
  const turnRadius = Math.max(config.overshoot, 10);

  const waypointsLocal: XY[] = [];
  const photoSamples: { pt: XY; heading: number }[] = [];

  order.forEach((stripIdx, k) => {
    let strip = offsetPath(centerLocal, normals, offsets[stripIdx]!);
    // Boustrophedon: every other strip is flown in the opposite direction.
    if (k % 2 === 1) strip = [...strip].reverse();
    if (planeTurns) {
      strip = applyTurnLoops(strip, config.maxTurnAngle ?? 15, turnRadius);
      strip = extendEnds(strip, overshoot);
    }
    waypointsLocal.push(...strip);
    if (!isManual) {
      photoSamples.push(...samplePolyline(strip, photoSpacing > 0 ? photoSpacing : lineSpacing));
    }
  });

  const waypoints: LatLng[] = waypointsLocal.map((p) => localToLatLng(origin, p.x, p.y));
  const photoPositions: LatLng[] = photoSamples.map((s) => localToLatLng(origin, s.pt.x, s.pt.y));
  const footprints: LatLng[][] = isManual
    ? []
    : photoSamples.map((s) =>
        footprintRect(origin, s.pt, s.heading, footprintH / 2, footprintW / 2),
      );

  // Stats. computeSurveyStats would report the area enclosed by the closed
  // centerline, which is meaningless for a corridor, so we build stats here and
  // report the swath area (centerline length × covered width) instead.
  let flightDistance = 0;
  for (let i = 1; i < waypoints.length; i++) {
    flightDistance += distanceLatLng(waypoints[i - 1]!, waypoints[i]!);
  }
  let centerLength = 0;
  for (let i = 1; i < centerSource.length; i++) {
    centerLength += distanceLatLng(centerSource[i - 1]!, centerSource[i]!);
  }
  const coveredWidth = nStrips * lineSpacing;
  const gsd = isManual
    ? 0
    : (camera.sensorWidth * altitude * 100) / (camera.focalLength * camera.imageWidth);

  const stats: SurveyStats = {
    gsd,
    flightDistance,
    flightTime: speed > 0 ? flightDistance / speed : 0,
    photoCount: photoPositions.length,
    lineCount: nStrips,
    areaCovered: centerLength * coveredWidth,
    footprintWidth: footprintW,
    footprintHeight: footprintH,
    lineSpacing,
    photoSpacing,
  };

  return { waypoints, photoPositions, footprints, stats };
}

/**
 * Corridor generator entrypoint. Runs the single-centerline core over the main
 * centerline (`config.polygon`) plus any branches (`config.corridorBranches`),
 * flown in sequence, and merges their waypoints/photos/stats into one result.
 * With no branches this is byte-for-byte the old single-corridor behavior.
 */
export function generateCorridor(config: SurveyConfig): SurveyResult {
  const centerlines = [config.polygon, ...(config.corridorBranches ?? [])].filter(
    (c): c is LatLng[] => Array.isArray(c) && c.length >= 2,
  );
  if (centerlines.length === 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Order and orient the runs before generating, so the aircraft works its way
  // along the line instead of crossing back for every spur it was drawn after.
  const plan = orderCorridorRuns(centerlines);
  const parts = plan.map(({ index, reversed }) => {
    const line = centerlines[index]!;
    return generateOneCorridor(config, reversed ? [...line].reverse() : line);
  });
  if (parts.length === 1) return parts[0]!;

  const waypoints = parts.flatMap((p) => p.waypoints);
  const photoPositions = parts.flatMap((p) => p.photoPositions);
  const footprints = parts.flatMap((p) => p.footprints);

  // Recompute distance over the merged path so the transits between branches
  // (last waypoint of one branch to the first of the next) are counted.
  let flightDistance = 0;
  for (let i = 1; i < waypoints.length; i++) {
    flightDistance += distanceLatLng(waypoints[i - 1]!, waypoints[i]!);
  }

  const first = parts[0]!.stats;
  const stats: SurveyStats = {
    gsd: first.gsd,
    flightDistance,
    flightTime: config.speed > 0 ? flightDistance / config.speed : 0,
    photoCount: photoPositions.length,
    lineCount: parts.reduce((n, p) => n + p.stats.lineCount, 0),
    areaCovered: parts.reduce((a, p) => a + p.stats.areaCovered, 0),
    footprintWidth: first.footprintWidth,
    footprintHeight: first.footprintHeight,
    lineSpacing: first.lineSpacing,
    photoSpacing: first.photoSpacing,
  };

  return { waypoints, photoPositions, footprints, stats };
}
