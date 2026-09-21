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

const entryOf = (run: LatLng[], reversed: boolean): LatLng => (reversed ? run[run.length - 1]! : run[0]!);
const exitOf = (run: LatLng[], reversed: boolean): LatLng => (reversed ? run[0]! : run[run.length - 1]!);

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
        const c = best[p] + distanceLatLng(exitOf(prev, p === 1), entry);
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

/**
 * Split the trunk wherever a branch meets it, so the route can pick a spur up
 * on the way past instead of flying the whole line and coming back.
 *
 * Measured on a 23 km power line with five spurs, this is the difference
 * between 11.6 km and 3.8 km of dead legs. The junction vertex belongs to both
 * neighbouring segments, so coverage is continuous across the cut.
 */
export function splitTrunkAtJunctions(trunk: LatLng[], branches: readonly LatLng[][]): LatLng[][] {
  if (trunk.length < 3 || branches.length === 0) return [trunk];

  const cuts = new Set<number>();
  for (const b of branches) {
    if (b.length < 2) continue;
    // A spur attaches by one of its ends; the nearer one is the junction.
    let bestIdx = -1;
    let bestD = Infinity;
    for (const end of [b[0]!, b[b.length - 1]!]) {
      for (let i = 0; i < trunk.length; i++) {
        const d = distanceLatLng(trunk[i]!, end);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
    }
    // Cutting at an end of the trunk would only make a one-point segment.
    if (bestIdx > 0 && bestIdx < trunk.length - 1) cuts.add(bestIdx);
  }
  if (cuts.size === 0) return [trunk];

  const segments: LatLng[][] = [];
  let start = 0;
  for (const cut of [...cuts].sort((a, b) => a - b)) {
    segments.push(trunk.slice(start, cut + 1));
    start = cut;
  }
  segments.push(trunk.slice(start));
  return segments.filter((s) => s.length >= 2);
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
export function orderCorridorRuns(runs: LatLng[][], pinFirst = false): RunOrder[] {
  const usable = runs.map((r, i) => ({ r, i })).filter((e) => e.r.length >= 2);
  if (usable.length <= 1) return usable.map((e) => ({ index: e.i, reversed: false }));

  const idx = usable.map((e) => e.i);
  const at = (i: number) => runs[i]!;

  // Greedy seed: from where the last run left off, take the run with the
  // nearest endpoint. 2-opt below repairs the corners greedy paints itself into.
  const order: number[] = [idx[0]!];
  const left = new Set(idx.slice(1));
  let cursor = exitOf(at(idx[0]!), false);
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
    cursor = exitOf(at(bestId), bestRev);
  }

  let bestOrder = order;
  let bestSolved = solveOrientations(runs, bestOrder, pinFirst);

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
    const solved = solveOrientations(runs, candidate, pinFirst);
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
export function transitDistance(runs: LatLng[][], plan: RunOrder[]): number {
  let total = 0;
  for (let i = 1; i < plan.length; i++) {
    const prev = plan[i - 1]!;
    const cur = plan[i]!;
    total += distanceLatLng(exitOf(runs[prev.index]!, prev.reversed), entryOf(runs[cur.index]!, cur.reversed));
  }
  return total;
}
