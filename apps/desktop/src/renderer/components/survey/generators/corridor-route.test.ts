import { describe, it, expect } from 'vitest';
import { orderCorridorRuns, splitTrunkAtJunctions, transitDistance, type RunOrder } from './corridor-route';
import type { LatLng } from '../survey-types';
import { TURN_LOOP_MIN_DEG } from './corridor-generator';

const p = (lat: number, lng: number): LatLng => ({ lat, lng });
/** Authoring order, entering every run at its first point: the old behaviour. */
const asDrawn = (runs: LatLng[][]): RunOrder[] => runs.map((_, index) => ({ index, reversed: false }));

describe('orderCorridorRuns', () => {
  it('leaves a lone corridor alone', () => {
    const runs = [[p(0, 0), p(0, 1)]];
    expect(orderCorridorRuns(runs)).toEqual([{ index: 0, reversed: false }]);
  });

  it('drops runs too short to fly', () => {
    const runs = [[p(0, 0), p(0, 1)], [p(5, 5)], []];
    expect(orderCorridorRuns(runs)).toEqual([{ index: 0, reversed: false }]);
  });

  // The pilot's case: a long trunk with spurs hanging off it at intervals.
  // Drawn in whatever order they were noticed, flown as drawn, the aircraft
  // crosses the whole site again for every spur.
  it('beats authoring order on a trunk with scattered spurs', () => {
    const trunk = [p(53.5, 9.0), p(53.5, 9.5)];
    const runs = [
      trunk,
      [p(53.52, 9.45), p(53.53, 9.46)],
      [p(53.52, 9.05), p(53.53, 9.06)],
      [p(53.52, 9.30), p(53.53, 9.31)],
      [p(53.48, 9.10), p(53.47, 9.11)],
    ];

    const plan = orderCorridorRuns(runs);
    expect(transitDistance(runs, plan)).toBeLessThan(transitDistance(runs, asDrawn(runs)));
    expect(plan.map((r) => r.index).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('enters a run from whichever end is nearer', () => {
    // The spur is drawn away from the trunk end, so it must be flown reversed.
    const runs = [
      [p(0, 0), p(0, 1)],
      [p(0, 3), p(0, 1.01)],
    ];
    const plan = orderCorridorRuns(runs);
    expect(plan[1]).toEqual({ index: 1, reversed: true });
  });

  // Holding the trunk first and forward is expensive: on a real line it forced
  // "whole trunk, then every spur" and cost 7.8 km, so it is off by default.
  it('optimises freely rather than holding the trunk first', () => {
    const runs = [
      [p(0, 5), p(0, 6)],
      [p(0, 0), p(0, 0.5)],
    ];
    const free = orderCorridorRuns(runs);
    const pinned = orderCorridorRuns(runs, true);
    expect(transitDistance(runs, free)).toBeLessThanOrEqual(transitDistance(runs, pinned));
  });

  // Both directions of a finished plan cost the same, so the spare freedom
  // buys a predictable start instead of wherever the greedy seed landed.
  it('starts near the head of the trunk when that is free', () => {
    const runs = [
      [p(0, 0), p(0, 1)],
      [p(0, 1), p(0, 2)],
      [p(0, 2), p(0, 3)],
    ];
    const plan = orderCorridorRuns(runs);
    expect(transitDistance(runs, plan)).toBeCloseTo(0, 6);
    expect(plan[0]).toEqual({ index: 0, reversed: false });
  });

  it('visits every run exactly once', () => {
    const runs = Array.from({ length: 9 }, (_, i) => [p(i % 3, i), p(i % 3, i + 0.4)]);
    const plan = orderCorridorRuns(runs);
    expect(new Set(plan.map((r) => r.index)).size).toBe(9);
    expect(plan).toHaveLength(9);
  });

  // A chain laid out end to end already has a zero-cost route; the optimiser
  // must find it rather than shuffling into something worse.
  it('finds the free route when one exists', () => {
    const runs = [
      [p(0, 0), p(0, 1)],
      [p(0, 1), p(0, 2)],
      [p(0, 2), p(0, 3)],
      [p(0, 3), p(0, 4)],
    ];
    const plan = orderCorridorRuns(runs);
    expect(transitDistance(runs, plan)).toBeCloseTo(0, 6);
    expect(plan.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  it('unpicks a deliberately terrible authoring order', () => {
    // Spurs alternate between the two ends of a long trunk.
    const runs = [
      [p(0, 0), p(0, 10)],
      [p(0.1, 9.8), p(0.2, 9.9)],
      [p(0.1, 0.2), p(0.2, 0.1)],
      [p(0.1, 9.6), p(0.2, 9.7)],
      [p(0.1, 0.4), p(0.2, 0.3)],
    ];
    const plan = orderCorridorRuns(runs);
    const before = transitDistance(runs, asDrawn(runs));
    const after = transitDistance(runs, plan);
    expect(after).toBeLessThan(before * 0.5);
  });
});

describe('splitTrunkAtJunctions', () => {
  const trunk = [p(0, 0), p(0, 1), p(0, 2), p(0, 3), p(0, 4)];

  it('leaves a trunk with no branches whole', () => {
    expect(splitTrunkAtJunctions(trunk, [])).toEqual([trunk]);
  });

  it('cuts where a spur meets it, sharing the junction vertex', () => {
    const spur = [[p(0.01, 2), p(0.5, 2)]];
    const segs = splitTrunkAtJunctions(trunk, spur);
    expect(segs).toHaveLength(2);
    expect(segs[0]![segs[0]!.length - 1]).toEqual(segs[1]![0]);
    // Every trunk vertex still appears, so coverage is unchanged.
    expect(segs.flat().map((q) => q.lng)).toEqual([0, 1, 2, 2, 3, 4]);
  });

  it('attaches by whichever end of the spur is nearer', () => {
    const drawnAway = [[p(0.5, 3), p(0.01, 3)]];
    const segs = splitTrunkAtJunctions(trunk, drawnAway);
    expect(segs).toHaveLength(2);
    expect(segs[0]![segs[0]!.length - 1]!.lng).toBe(3);
  });

  it('never cuts at an end, which would strand a single point', () => {
    const atStart = [[p(0.01, 0), p(0.5, 0)]];
    const atEnd = [[p(0.01, 4), p(0.5, 4)]];
    expect(splitTrunkAtJunctions(trunk, atStart)).toEqual([trunk]);
    expect(splitTrunkAtJunctions(trunk, atEnd)).toEqual([trunk]);
  });

  it('handles several spurs, in vertex order', () => {
    const spurs = [[p(0.01, 3), p(0.5, 3)], [p(0.01, 1), p(0.5, 1)]];
    const segs = splitTrunkAtJunctions(trunk, spurs);
    expect(segs).toHaveLength(3);
    expect(segs.map((sg) => sg.length)).toEqual([2, 3, 2]);
  });

  // The whole point: picking spurs up on the way beats a return trip.
  it('lets the router pick spurs up in passing', () => {
    const line = Array.from({ length: 21 }, (_, i) => p(0, i * 0.01));
    const spurs = [
      [p(0.001, 0.05), p(0.01, 0.05)],
      [p(0.001, 0.15), p(0.01, 0.15)],
    ];
    const whole = [line, ...spurs];
    const split = [...splitTrunkAtJunctions(line, spurs), ...spurs];
    expect(transitDistance(split, orderCorridorRuns(split)))
      .toBeLessThan(transitDistance(whole, orderCorridorRuns(whole)));
  });
});

describe('the racetrack threshold', () => {
  // Inserting the pair replaces one turn of θ with two of (180 - θ/2), so it
  // only helps past 120°. The generator enforces that floor whatever the
  // slider says; this pins the arithmetic the floor comes from.
  it('is where a loop stops being sharper than the corner', () => {
    const loopTurn = (theta: number) => 180 - theta / 2;
    expect(loopTurn(TURN_LOOP_MIN_DEG)).toBeCloseTo(TURN_LOOP_MIN_DEG, 6);
    expect(loopTurn(90)).toBeGreaterThan(90);
    expect(loopTurn(170)).toBeLessThan(170);
  });
});
