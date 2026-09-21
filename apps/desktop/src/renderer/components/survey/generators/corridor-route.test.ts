import { describe, it, expect } from 'vitest';
import { orderCorridorRuns, transitDistance, type RunOrder } from './corridor-route';
import type { LatLng } from '../survey-types';

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

  it('keeps the trunk first and forward, so the briefed start point holds', () => {
    const runs = [
      [p(0, 5), p(0, 6)],
      [p(0, 0), p(0, 0.5)],
      [p(0, 1), p(0, 1.5)],
    ];
    const plan = orderCorridorRuns(runs);
    expect(plan[0]).toEqual({ index: 0, reversed: false });
  });

  it('will reorient the trunk when told it may', () => {
    const runs = [
      [p(0, 5), p(0, 6)],
      [p(0, 0), p(0, 0.5)],
    ];
    const free = orderCorridorRuns(runs, false);
    const pinned = orderCorridorRuns(runs, true);
    expect(transitDistance(runs, free)).toBeLessThanOrEqual(transitDistance(runs, pinned));
    expect(free[0]!.reversed).toBe(true);
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
