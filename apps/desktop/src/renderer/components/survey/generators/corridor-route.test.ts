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
    const pinned = orderCorridorRuns(runs, { pinFirst: true });
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
  const metres = (a: LatLng, b: LatLng) =>
    Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

  it('leaves a trunk with no branches whole', () => {
    expect(splitTrunkAtJunctions(trunk, []).segments).toEqual([trunk]);
  });

  it('cuts where a spur meets it, sharing the junction point', () => {
    const { segments } = splitTrunkAtJunctions(trunk, [[p(0.01, 2), p(0.5, 2)]]);
    expect(segments).toHaveLength(2);
    expect(segments[0]![segments[0]!.length - 1]).toEqual(segments[1]![0]);
    expect(segments.flat().map((q) => q.lng)).toEqual([0, 1, 2, 2, 3, 4]);
  });

  // The Area Editor snaps a spur to the nearest POINT on the line, which is
  // usually mid-segment. Cutting at the nearest vertex instead left the spur
  // starting where no trunk piece reached, so the corridor came out in
  // disconnected parts.
  it('cuts mid-segment, where the spur actually meets the line', () => {
    const { segments, branches } = splitTrunkAtJunctions(trunk, [[p(0.01, 2.5), p(0.5, 2.5)]]);
    expect(segments).toHaveLength(2);
    const joinA = segments[0]![segments[0]!.length - 1]!;
    const joinB = segments[1]![0]!;
    expect(joinA.lng).toBeCloseTo(2.5, 9);
    expect(joinA).toEqual(joinB);
    // And the spur now starts exactly on that point, so the pieces connect.
    expect(metres(branches[0]![0]!, joinA)).toBeLessThan(0.01);
  });

  it('keeps every trunk vertex, so nothing is skipped', () => {
    const { segments } = splitTrunkAtJunctions(trunk, [[p(0.01, 2.5), p(0.5, 2.5)]]);
    const lngs = segments.flat().map((q) => q.lng);
    for (const v of [0, 1, 2, 3, 4]) expect(lngs).toContain(v);
  });

  it('attaches by whichever end of the spur is nearer', () => {
    const drawnAway = [[p(0.5, 3), p(0.01, 3)]];
    const { segments, branches } = splitTrunkAtJunctions(trunk, drawnAway);
    expect(segments).toHaveLength(2);
    expect(segments[0]![segments[0]!.length - 1]!.lng).toBeCloseTo(3, 9);
    // Reversed so it starts at the junction and runs away from the line.
    expect(branches[0]![0]!.lng).toBeCloseTo(3, 9);
    expect(branches[0]![branches[0]!.length - 1]!.lat).toBeCloseTo(0.5, 9);
  });

  it('never cuts at a tip, which would strand a single point', () => {
    expect(splitTrunkAtJunctions(trunk, [[p(0.01, 0), p(0.5, 0)]]).segments).toEqual([trunk]);
    expect(splitTrunkAtJunctions(trunk, [[p(0.01, 4), p(0.5, 4)]]).segments).toEqual([trunk]);
  });

  it('handles several spurs, in order along the trunk', () => {
    const spurs = [[p(0.01, 3.5), p(0.5, 3.5)], [p(0.01, 1.5), p(0.5, 1.5)]];
    const { segments } = splitTrunkAtJunctions(trunk, spurs);
    expect(segments).toHaveLength(3);
    const ends = segments.map((sg) => sg[sg.length - 1]!.lng);
    expect(ends[0]).toBeCloseTo(1.5, 9);
    expect(ends[1]).toBeCloseTo(3.5, 9);
  });

  it('lets the router pick spurs up in passing', () => {
    const line = Array.from({ length: 21 }, (_, i) => p(0, i * 0.01));
    const spurs = [
      [p(0.001, 0.055), p(0.01, 0.055)],
      [p(0.001, 0.155), p(0.01, 0.155)],
    ];
    const whole = [line, ...spurs];
    const { segments, branches } = splitTrunkAtJunctions(line, spurs);
    const split = [...segments, ...branches];
    expect(transitDistance(split, orderCorridorRuns(split)))
      .toBeLessThan(transitDistance(whole, orderCorridorRuns(whole)));
  });
});

describe('strip parity', () => {
  // An even strip count flies the run out and back, so the aircraft leaves
  // from the end it arrived at. Costing the next transit from the far end
  // sent the router to the wrong place entirely.
  const runs = [
    [p(0, 0), p(0, 1)],
    [p(0, 3), p(0, 4)],
  ];

  it('costs a round-trip run from the end it entered', () => {
    const plan: RunOrder[] = [{ index: 0, reversed: false }, { index: 1, reversed: false }];
    const oneWay = transitDistance(runs, plan, false);
    const roundTrip = transitDistance(runs, plan, true);
    expect(roundTrip).toBeGreaterThan(oneWay);
  });

  it('orients differently once it knows the run comes back', () => {
    const oneWay = orderCorridorRuns(runs, { roundTrip: false });
    const roundTrip = orderCorridorRuns(runs, { roundTrip: true });
    expect(transitDistance(runs, roundTrip, true)).toBeLessThanOrEqual(transitDistance(runs, oneWay, true));
  });

  it('is unchanged for an odd count, which does exit at the far end', () => {
    expect(orderCorridorRuns(runs)).toEqual(orderCorridorRuns(runs, { roundTrip: false }));
  });
});
