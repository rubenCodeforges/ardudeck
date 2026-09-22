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
 *    sharper than maxTurnAngle. Strip ORDER also comes from the turn radius:
 *    lines closer together than a turn diameter are flown with a stride
 *    between them so each reversal fits. Copter mode skips both.
 * 7. Sample photo positions + footprints along each strip (camera mode).
 *
 * Branched corridors (a main axis with side spurs: forked roads, power-line
 * taps, river tributaries) are supported via `config.corridorBranches`: each
 * branch is a further open centerline generated with this same strip algorithm.
 * The trunk is cut where the spurs meet it and every resulting run is ordered
 * and oriented to keep the dead legs short (see corridor-route), so a spur is
 * flown on the way past rather than after the whole line. They share the
 * corridor's width/overlap/camera settings. Junctions are visual only and some
 * overlap at a fork is accepted, which matches every other corridor tool (UgCS,
 * QGC, DroneDeploy, Pix4D) - those force the operator to manage disconnected
 * routes by hand instead of keeping the branches in one corridor object.
 */
import type { LatLng, SurveyConfig, SurveyResult, SurveyStats } from '../survey-types';
import { latLngToLocal, localToLatLng, polygonCentroid, distanceLatLng } from '../geo-math';
import { getEffectiveFootprint, getEffectiveSpacing } from '../survey-stats';
import { orderCorridorRuns, splitTrunkAtJunctions } from './corridor-route';
import { stripFlightOrder } from './strip-order';
import { planTurnRadius } from './turn-radius';
import { withLeadIn } from '../survey-leadin';

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
 *
 * Below TURN_LOOP_MIN_DEG the pair replaces one turn of θ with two of
 * (180 - θ/2), which is the sharper manoeuvre, so the panel warns there. It is
 * still the operator's call: the threshold is theirs to set, not ours to clamp.
 */
export const TURN_LOOP_MIN_DEG = 120;

/** Consecutive waypoints closer than this are the same point twice. */
const WAYPOINT_MERGE_M = 0.5;

/**
 * How many bends in the drawn centrelines are sharp enough to earn a racetrack
 * at `thresholdDeg`. Zero is the honest answer to "the racetrack does nothing":
 * the line has no hairpin that sharp.
 */
export function countHairpins(centrelines: (LatLng[] | null | undefined)[], thresholdDeg: number): number {
  const limit = (Math.max(thresholdDeg, 1) * Math.PI) / 180;
  let count = 0;
  for (const line of centrelines) {
    if (!Array.isArray(line) || line.length < 3) continue;
    const origin = polygonCentroid(line);
    const pts = line.map((v) => latLngToLocal(origin, v));
    for (let i = 1; i < pts.length - 1; i++) {
      const di = unit(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      const dout = unit(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
      const dot = Math.max(-1, Math.min(1, di.x * dout.x + di.y * dout.y));
      if (Math.acos(dot) > limit) count++;
    }
  }
  return count;
}

/**
 * Fly `overshoot` metres past a strip end before turning back, so the turn is
 * outside the mapped line. Only at ends where it turns around: extending at a
 * junction would fly a stub past the fork and back again.
 */
function extendEnds(strip: XY[], overshoot: number, atStart: boolean, atEnd: boolean): XY[] {
  if (strip.length < 2 || overshoot <= 0) return strip;
  const out = [...strip];
  if (atStart) {
    const a = out[0]!;
    const b = out[1]!;
    const d = unit(a.x - b.x, a.y - b.y);
    out.unshift({ x: a.x + d.x * overshoot, y: a.y + d.y * overshoot });
  }
  if (atEnd) {
    const z = out[out.length - 1]!;
    const y = out[out.length - 2]!;
    const d = unit(z.x - y.x, z.y - y.y);
    out.push({ x: z.x + d.x * overshoot, y: z.y + d.y * overshoot });
  }
  return out;
}

function applyTurnLoops(path: XY[], maxTurnDeg: number, radius: number): XY[] {
  if (path.length < 3 || radius <= 0) return path;
  const maxTurnRad = (Math.max(maxTurnDeg, 1) * Math.PI) / 180;
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

/** Line spacing the strips are laid out on, ahead of generating any of them. */
function effectiveLineSpacing(config: SurveyConfig): number {
  const { width, height } = getEffectiveFootprint(config.camera, config.altitude);
  return getEffectiveSpacing(config.camera, width, height, config.frontOverlap, config.sideOverlap).lineSpacing;
}

/**
 * How many parallel strips a run is flown as. Shared with the pass scheduler,
 * which needs it before any strip has been generated.
 */
function corridorStripCount(config: SurveyConfig, lineSpacing?: number): number {
  const explicit = config.corridorStrips ?? 0;
  if (explicit > 0) return Math.min(40, explicit);
  if (lineSpacing === undefined || lineSpacing <= 0) return 1;
  return Math.max(1, Math.min(40, Math.ceil((config.corridorWidth ?? 60) / lineSpacing)));
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
 * Generate strips for a SINGLE centerline.
 *
 * `only` restricts it to one strip, flown in the given direction, so
 * generateCorridor can run a pass across the whole network instead of
 * finishing each run before moving on.
 */
function generateOneCorridor(
  config: SurveyConfig,
  centerline: LatLng[],
  only?: { stripIdx: number; reverse: boolean },
  freeEnds: { start: boolean; end: boolean } = { start: true, end: true },
): SurveyResult {
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
  const nStrips = corridorStripCount(config, lineSpacing);

  // Lateral offsets, centered on the centerline (+ side-offset bias). An odd
  // count puts one strip on the centerline; an even count straddles it.
  const half = (nStrips - 1) / 2;
  const sideOffset = config.corridorSideOffset ?? 0;
  const offsets: number[] = [];
  for (let i = 0; i < nStrips; i++) offsets.push((i - half) * lineSpacing + sideOffset);

  // Strip order comes from what the aircraft can turn, not from 1,2,3. Lines
  // closer together than a turn diameter are flown with a stride between them
  // so each reversal has room; that is what replaces bolting an overshoot
  // waypoint onto every end.
  const turnRadius = planeTurns ? planTurnRadius(config) : 0;
  // The loop is sized by the operator's overshoot alone. Feeding the computed
  // radius in here let one vehicle's AIRSPEED_CRUISE of 100 m/s put a 1766 m
  // loop on every bend: 2.9 km of corridor came out as 95 km.
  const loopRadius = Math.max(config.overshoot, 10);
  const stripPlan = stripFlightOrder(
    nStrips,
    lineSpacing,
    (config.stripOrder ?? 'auto') === 'sequential' ? 0 : turnRadius,
  );
  const order = config.flipLegs ? [...stripPlan.order].reverse() : stripPlan.order;

  const normals = vertexNormals(centerLocal);

  const waypointsLocal: XY[] = [];
  const legStarts: number[] = [];
  const photoSamples: { pt: XY; heading: number }[] = [];

  const passes: Array<{ stripIdx: number; reverse: boolean }> = only
    ? [only]
    : order.map((stripIdx, k) => ({ stripIdx, reverse: k % 2 === 1 }));

  passes.forEach(({ stripIdx, reverse }) => {
    let strip = offsetPath(centerLocal, normals, offsets[stripIdx] ?? offsets[0]!);
    // Boustrophedon: every other strip is flown in the opposite direction.
    if (reverse) strip = [...strip].reverse();
    if (planeTurns) {
      strip = applyTurnLoops(strip, config.maxTurnAngle ?? 15, loopRadius);
      // invertPath already reversed the source, so the strip's first point is
      // the centerline's last whenever exactly one of the two flips applied.
      const flipped = !!config.invertPath !== reverse;
      strip = extendEnds(
        strip,
        config.overshoot,
        flipped ? freeEnds.end : freeEnds.start,
        flipped ? freeEnds.start : freeEnds.end,
      );
    }
    legStarts.push(waypointsLocal.length);
    waypointsLocal.push(...strip);
    if (!isManual) {
      photoSamples.push(...samplePolyline(strip, photoSpacing > 0 ? photoSpacing : lineSpacing));
    }
  });

  const placed: LatLng[] = waypointsLocal.map((p) => localToLatLng(origin, p.x, p.y));
  // `only` is one pass of a multi-run plan; the lead-in belongs to the whole
  // route and is added once, when the parts are merged.
  const waypoints = only ? placed : withLeadIn(placed, config.leadIn ?? 0);
  const leadShift = waypoints.length - placed.length;
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
  // A part that generated a single strip must report a single strip, or the
  // merged stats count each pass as the whole run's worth of lines and area.
  const stripsGenerated = only ? 1 : nStrips;
  const coveredWidth = stripsGenerated * lineSpacing;
  const gsd = isManual
    ? 0
    : (camera.sensorWidth * altitude * 100) / (camera.focalLength * camera.imageWidth);

  const stats: SurveyStats = {
    gsd,
    flightDistance,
    flightTime: speed > 0 ? flightDistance / speed : 0,
    photoCount: photoPositions.length,
    lineCount: stripsGenerated,
    areaCovered: centerLength * coveredWidth,
    footprintWidth: footprintW,
    footprintHeight: footprintH,
    lineSpacing,
    photoSpacing,
  };

  return {
    waypoints,
    photoPositions,
    footprints,
    stats,
    legStarts: legStarts.map((i) => i + leadShift),
  };
}

/**
 * Corridor generator entrypoint. Runs the single-centerline core over the main
 * centerline (`config.polygon`) plus any branches (`config.corridorBranches`),
 * flown in sequence, and merges their waypoints/photos/stats into one result.
 * With no branches this is byte-for-byte the old single-corridor behavior.
 */
export function generateCorridor(config: SurveyConfig): SurveyResult {
  const branches = (config.corridorBranches ?? []).filter(
    (c): c is LatLng[] => Array.isArray(c) && c.length >= 2,
  );
  const trunk = Array.isArray(config.polygon) && config.polygon.length >= 2 ? config.polygon : null;
  // Cut the trunk where the spurs meet it, so a spur can be flown on the way
  // past rather than after the whole line. Coverage is identical either way.
  const split = trunk ? splitTrunkAtJunctions(trunk, branches) : null;
  const centerlines = split ? [...split.segments, ...split.branches] : [...branches];
  if (centerlines.length === 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Order and orient the runs before generating, so the aircraft works its way
  // along the line instead of crossing back for every spur it was drawn after.
  const stripCount = corridorStripCount(config, effectiveLineSpacing(config));
  const plan = orderCorridorRuns(centerlines);
  const oriented = plan.map(({ index, reversed }) => {
    const line = centerlines[index]!;
    return reversed ? [...line].reverse() : line;
  });

  // Which way round to nest runs and strips, decided by parity.
  //
  // An ODD strip count leaves the aircraft at the far end of a run, so runs
  // chain: finish every strip of one, move to the next, and the transit is
  // paid once. An EVEN count brings it back to where it started, so chaining
  // means retracing the run to reach the next one - about 15 km of dead legs
  // on a 23 km line at two strips. There, fly one PASS across the whole
  // network and the next pass back along it instead.
  const stripOrder: number[] = [];
  for (let i = 0; i < stripCount; i++) stripOrder.push(i);
  if (config.flipLegs) stripOrder.reverse();

  // Flatten the schedule first, so each leg knows what follows it and can
  // tell a junction (the path runs straight on) from a turnaround.
  // A terminal shared with another run is a junction: the aircraft flies
  // through it, so it must not get an overshoot stub.
  const key = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const terminalUses = new Map<string, number>();
  for (const line of oriented) {
    for (const p of [line[0]!, line[line.length - 1]!]) {
      terminalUses.set(key(p), (terminalUses.get(key(p)) ?? 0) + 1);
    }
  }
  const freeEndsOf = (line: LatLng[]) => ({
    start: (terminalUses.get(key(line[0]!)) ?? 0) < 2,
    end: (terminalUses.get(key(line[line.length - 1]!)) ?? 0) < 2,
  });

  interface Leg { line: LatLng[]; only?: { stripIdx: number; reverse: boolean } }
  const legs: Leg[] = [];
  if (stripCount % 2 === 1) {
    for (const line of oriented) legs.push({ line });
  } else {
    stripOrder.forEach((stripIdx, pass) => {
      const runs = pass % 2 === 1 ? [...oriented].reverse() : oriented;
      for (const line of runs) legs.push({ line, only: { stripIdx, reverse: pass % 2 === 1 } });
    });
  }

  const parts = legs.map((leg) => generateOneCorridor(config, leg.line, leg.only, freeEndsOf(leg.line)));
  if (parts.length === 1) return parts[0]!;

  // No arc waypoints here on purpose: ArduPlane's L1/NPFG controller starts
  // the turn early and curves through on its own, with the radius set by
  // airspeed and bank angle (WP_RADIUS bounds how early). Describing the turn
  // in waypoints tells the autopilot nothing it does not already do, and the
  // flown curve belongs on the map, not in the mission.
  const joined = parts.flatMap((part) => part.waypoints);

  // Leg starts are indices, so they have to survive the duplicate merge below.
  const joinedLegStarts = new Set<number>();
  let offset = 0;
  for (const part of parts) {
    for (const start of part.legStarts ?? []) joinedLegStarts.add(offset + start);
    offset += part.waypoints.length;
  }

  const merged: LatLng[] = [];
  const mergedLegStarts: number[] = [];
  joined.forEach((wp, i) => {
    const previous = merged[merged.length - 1];
    if (previous && distanceLatLng(previous, wp) <= WAYPOINT_MERGE_M) return;
    if (joinedLegStarts.has(i)) mergedLegStarts.push(merged.length);
    merged.push(wp);
  });

  // The lead-in shifts every index by one, legStarts included.
  const waypoints = withLeadIn(merged, config.leadIn ?? 0);
  const shift = waypoints.length - merged.length;
  const legStarts = mergedLegStarts.map((i) => i + shift);
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
    // Counted over the centrelines the OPERATOR drew, not the pieces the
    // router cut them into: splitting the trunk at a junction is an internal
    // routing step and must not inflate the line count they read.
    lineCount: stripCount * ((trunk ? 1 : 0) + branches.length),
    areaCovered: parts.reduce((a, p) => a + p.stats.areaCovered, 0),
    footprintWidth: first.footprintWidth,
    footprintHeight: first.footprintHeight,
    lineSpacing: first.lineSpacing,
    photoSpacing: first.photoSpacing,
  };

  return { waypoints, photoPositions, footprints, stats, legStarts };
}
