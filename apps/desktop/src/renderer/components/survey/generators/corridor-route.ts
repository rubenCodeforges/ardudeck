/**
 * Flight order for a branched corridor.
 *
 * The generator used to fly the trunk, then each branch in the order they were
 * drawn, entering every one at its first point. On a real power line that is
 * the worst case: the aircraft reaches the far end of the trunk, flies back to
 * a spur near the start, out again to the next, and the dead legs between runs
 * can outweigh the survey itself.
 *
 * The runs themselves are fixed, so the only cost worth minimising is the
 * transit between them, which depends on the order AND on which end of each
 * run the aircraft enters. Orientation is solved exactly for a given order by
 * a two-state DP; the order is then improved by 2-opt over that exact cost.
 *
 * This does not re-fly trunk segments to reach a spur (the Chinese-postman
 * answer). Transits happen at survey altitude with the camera off, so the win
 * is in not crossing the site repeatedly, not in retracing the line.
 */

import type { LatLng } from '../survey-types';
import { distanceLatLng } from '../geo-math';

export interface RunOrder {
  /** Index into the input array. */
  index: number;
  /** Fly the centreline from its last point to its first. */
  reversed: boolean;
}

export interface RouteOptions {
  /** Hold run 0 first and forward. Expensive; see orderCorridorRuns. */
  pinFirst?: boolean;
  /**
   * An even strip count flies the run out and back, so the aircraft leaves
   * from the end it arrived at. Modelling every run as exiting at its far end
   * made the router plan the next transit from the wrong place: on a 23 km
   * line at two strips that was 27.5 km of dead legs, one of them 9.3 km.
   */
  roundTrip?: boolean;
}

const entryOf = (run: LatLng[], reversed: boolean): LatLng => (reversed ? run[run.length - 1]! : run[0]!);
const farEndOf = (run: LatLng[], reversed: boolean): LatLng => (reversed ? run[0]! : run[run.length - 1]!);
const exitOf = (run: LatLng[], reversed: boolean, roundTrip = false): LatLng =>
  (roundTrip ? entryOf(run, reversed) : farEndOf(run, reversed));

/**
 * Cheapest orientations for a fixed visiting order, and what they cost.
 *
 * `pinFirst` holds the first run forward so the mission still starts where the
 * trunk was drawn; a pilot briefed on a start point should get that start point.
 */
function solveOrientations(
  runs: LatLng[][],
  order: number[],
  pinFirst: boolean,
  roundTrip: boolean,
): { cost: number; reversed: boolean[] } {
  const n = order.length;
  if (n === 0) return { cost: 0, reversed: [] };

  // best[s] = cheapest transit total ending with run i oriented s.
  let best: [number, number] = pinFirst ? [0, Infinity] : [0, 0];
  const from: Array<[number, number]> = [];

  for (let i = 1; i < n; i++) {
    const prev = runs[order[i - 1]!]!;
    const cur = runs[order[i]!]!;
    const next: [number, number] = [Infinity, Infinity];
    const pick: [number, number] = [0, 0];
    for (const s of [0, 1] as const) {
      const entry = entryOf(cur, s === 1);
      for (const p of [0, 1] as const) {
        if (!Number.isFinite(best[p])) continue;
        const c = best[p] + distanceLatLng(exitOf(prev, p === 1, roundTrip), entry);
        if (c < next[s]) { next[s] = c; pick[s] = p; }
      }
    }
    from.push(pick);
    best = next;
  }

  const last = best[1] < best[0] ? 1 : 0;
  const reversed = new Array<boolean>(n);
  let s = last;
  for (let i = n - 1; i >= 1; i--) {
    reversed[i] = s === 1;
    s = from[i - 1]![s]!;
  }
  reversed[0] = s === 1;
  return { cost: Math.min(best[0], best[1]), reversed };
}

/** Where a spur meets the trunk: a point on a segment, not necessarily a vertex. */
interface Junction {
  /** Index of the trunk segment the junction lies on. */
  segIndex: number;
  /** Position along that segment, 0..1. */
  t: number;
  point: LatLng;
  distanceM: number;
}

/** Nearest point on an open polyline to `p`, projected onto its segments. */
function projectOntoPolyline(line: readonly LatLng[], p: LatLng): Junction | null {
  if (line.length < 2) return null;
  let best: Junction | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    // Local metres: lat/lng ratios differ, so project in a flat frame.
    const kx = Math.cos((a.lat * Math.PI) / 180);
    const ax = 0;
    const ay = 0;
    const bx = (b.lng - a.lng) * kx;
    const by = b.lat - a.lat;
    const px = (p.lng - a.lng) * kx;
    const py = p.lat - a.lat;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const point: LatLng = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = distanceLatLng(p, point);
    if (!best || d < best.distanceM) best = { segIndex: i, t, point, distanceM: d };
  }
  return best;
}

/**
 * Slide a point onto the nearest of several centrelines.
 *
 * A branch is attached at creation but was free to drift afterwards: dragging
 * its junction vertex wrote the raw cursor position, so the spur came away
 * from the line and the corridor generated in two disconnected pieces.
 * Snapping keeps the junction on the line while still letting it slide along.
 */
export function snapToNearestCenterline(p: LatLng, lines: ReadonlyArray<readonly LatLng[]>): LatLng {
  let best: LatLng = p;
  let bestD = Infinity;
  for (const line of lines) {
    const j = projectOntoPolyline(line, p);
    if (j && j.distanceM < bestD) { bestD = j.distanceM; best = j.point; }
  }
  return best;
}

export interface SplitTrunk {
  /** Trunk pieces, cut at the junctions and sharing the junction point. */
  segments: LatLng[][];
  /** Branches with their junction end moved onto the trunk exactly. */
  branches: LatLng[][];
}

/**
 * Split the trunk wherever a branch meets it, so the route can pick a spur up
 * on the way past instead of flying the whole line and coming back.
 *
 * The cut goes at the projected point on the trunk, not at the nearest
 * vertex. A spur is snapped to the nearest point on the line, which is
 * usually mid-segment, and on a power line the vertices are hundreds of
 * metres apart: cutting at a vertex left the spur starting somewhere the
 * trunk pieces never touch, so the corridor came out in disconnected parts.
 *
 * Measured on a 23 km power line with five spurs, splitting is the difference
 * between 11.6 km and 3.8 km of dead legs. Both sides of a cut carry the
 * junction point, and the branch end is moved onto it, so the pieces join.
 */
export function splitTrunkAtJunctions(trunk: LatLng[], branches: readonly LatLng[][]): SplitTrunk {
  const asIs = { segments: [trunk], branches: branches.map((b) => [...b]) };
  if (trunk.length < 2 || branches.length === 0) return asIs;

  const junctions: Junction[] = [];
  const adjusted: LatLng[][] = [];

  for (const b of branches) {
    if (b.length < 2) { adjusted.push([...b]); continue; }
    const head = projectOntoPolyline(trunk, b[0]!);
    const tail = projectOntoPolyline(trunk, b[b.length - 1]!);
    if (!head || !tail) { adjusted.push([...b]); continue; }
    // A spur attaches by one of its ends; the nearer one is the junction.
    const atHead = head.distanceM <= tail.distanceM;
    const j = atHead ? head : tail;
    const line = atHead ? [...b] : [...b].reverse();
    line[0] = j.point;
    adjusted.push(line);
    junctions.push(j);
  }

  if (junctions.length === 0) return { segments: [trunk], branches: adjusted };

  // Cut in order along the trunk. A junction landing on an existing vertex
  // needs no new point, and one at either tip would strand a single point.
  const ordered = [...junctions].sort((a, b) => (a.segIndex - b.segIndex) || (a.t - b.t));
  const segments: LatLng[][] = [];
  // A junction landing exactly on a vertex is the same point twice; appending
  // it anyway left a zero-length hop in the middle of the segment.
  const push = (arr: LatLng[], q: LatLng) => {
    const last = arr[arr.length - 1];
    if (!last || distanceLatLng(last, q) > 1e-6) arr.push(q);
  };
  let current: LatLng[] = [trunk[0]!];
  let cursor = 0;

  for (const j of ordered) {
    if (j.segIndex < cursor) continue;
    for (let i = cursor + 1; i <= j.segIndex; i++) push(current, trunk[i]!);
    cursor = j.segIndex;
    const atStart = j.t <= 1e-9 && j.segIndex === 0;
    const atEnd = j.t >= 1 - 1e-9 && j.segIndex === trunk.length - 2;
    if (atStart || atEnd) continue;
    push(current, j.point);
    if (current.length >= 2) segments.push(current);
    current = [j.point];
  }
  for (let i = cursor + 1; i < trunk.length; i++) push(current, trunk[i]!);
  if (current.length >= 2) segments.push(current);

  return { segments: segments.length > 0 ? segments : [trunk], branches: adjusted };
}

/**
 * Order and orient the runs so the transits between them are as short as this
 * can make them.
 *
 * `pinFirst` holds run 0 first and forward. It is off by default because it is
 * expensive: on the line above it forced "whole trunk, then every spur" and
 * cost 7.8 km. Instead, of the two directions the finished plan can be flown
 * (identical cost), the one starting nearer the trunk's own start is chosen,
 * so the mission still begins where the line begins whenever that is free.
 */
export function orderCorridorRuns(runs: LatLng[][], opts: RouteOptions = {}): RunOrder[] {
  const { pinFirst = false, roundTrip = false } = opts;
  const usable = runs.map((r, i) => ({ r, i })).filter((e) => e.r.length >= 2);
  if (usable.length <= 1) return usable.map((e) => ({ index: e.i, reversed: false }));

  const idx = usable.map((e) => e.i);
  const at = (i: number) => runs[i]!;

  // Greedy seed: from where the last run left off, take the run with the
  // nearest endpoint. 2-opt below repairs the corners greedy paints itself into.
  const order: number[] = [idx[0]!];
  const left = new Set(idx.slice(1));
  let cursor = exitOf(at(idx[0]!), false, roundTrip);
  while (left.size > 0) {
    let bestId = -1;
    let bestD = Infinity;
    let bestRev = false;
    for (const j of left) {
      for (const rev of [false, true]) {
        const d = distanceLatLng(cursor, entryOf(at(j), rev));
        if (d < bestD) { bestD = d; bestId = j; bestRev = rev; }
      }
    }
    if (bestId < 0) break;
    order.push(bestId);
    left.delete(bestId);
    cursor = exitOf(at(bestId), bestRev, roundTrip);
  }

  let bestOrder = order;
  let bestSolved = solveOrientations(runs, bestOrder, pinFirst, roundTrip);

  // 2-opt plus Or-opt over the visiting order, scored with the exact
  // orientation DP. The run count here is a handful of spurs, so the cubic
  // worst case is nothing.
  //
  // Or-opt is the one that matters on a split trunk: the trunk segments chain
  // at zero cost, so reversing a block (all 2-opt can do) never separates
  // them, and a spur can only get picked up on the way past if a single run
  // can be lifted out and dropped between two segments.
  const start = pinFirst ? 1 : 0;
  const tryCandidate = (candidate: number[]): boolean => {
    const solved = solveOrientations(runs, candidate, pinFirst, roundTrip);
    if (solved.cost < bestSolved.cost - 1e-6) {
      bestOrder = candidate;
      bestSolved = solved;
      return true;
    }
    return false;
  };

  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (let i = start; i < bestOrder.length - 1; i++) {
      for (let j = i + 1; j < bestOrder.length; j++) {
        if (tryCandidate([
          ...bestOrder.slice(0, i),
          ...bestOrder.slice(i, j + 1).reverse(),
          ...bestOrder.slice(j + 1),
        ])) improved = true;
      }
    }
    for (let i = start; i < bestOrder.length; i++) {
      const without = [...bestOrder.slice(0, i), ...bestOrder.slice(i + 1)];
      const moved = bestOrder[i]!;
      for (let j = start; j <= without.length; j++) {
        if (j === i) continue;
        if (tryCandidate([...without.slice(0, j), moved, ...without.slice(j)])) {
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }

  const plan = bestOrder.map((index, k) => ({ index, reversed: bestSolved.reversed[k] === true }));
  if (pinFirst) return plan;

  // Flying the plan backwards costs exactly the same, so spend that freedom on
  // starting near the head of the trunk rather than wherever greedy landed.
  const anchor = runs[usable[0]!.i]![0]!;
  const flipped = [...plan].reverse().map((r) => ({ index: r.index, reversed: !r.reversed }));
  const startOf = (p: RunOrder[]) => entryOf(runs[p[0]!.index]!, p[0]!.reversed);
  return distanceLatLng(startOf(flipped), anchor) < distanceLatLng(startOf(plan), anchor) ? flipped : plan;
}

/** Total transit flown between runs, for a given plan. Used by the tests. */
export function transitDistance(runs: LatLng[][], plan: RunOrder[], roundTrip = false): number {
  let total = 0;
  for (let i = 1; i < plan.length; i++) {
    const prev = plan[i - 1]!;
    const cur = plan[i]!;
    total += distanceLatLng(
      exitOf(runs[prev.index]!, prev.reversed, roundTrip),
      entryOf(runs[cur.index]!, cur.reversed),
    );
  }
  return total;
}
