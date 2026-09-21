import { describe, it, expect } from 'vitest';
import { predictFlownPath, turnRadiusFor, coverageGaps } from './flown-path';
import type { LatLng } from '../survey/survey-types';

const p = (lat: number, lng: number): LatLng => ({ lat, lng });
const M_PER_DEG_LAT = 110_540;
const metres = (a: LatLng, b: LatLng) =>
  Math.hypot((a.lat - b.lat) * M_PER_DEG_LAT, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

describe('turnRadiusFor', () => {
  it('matches the level-turn formula a pilot would use', () => {
    // 14.4 m/s at 30° bank: 14.4² / (9.81 · tan30) ≈ 36.6 m
    expect(turnRadiusFor(14.4, 30)).toBeCloseTo(36.6, 0);
    expect(turnRadiusFor(20, 30)).toBeCloseTo(70.6, 0);
  });

  it('tightens with bank', () => {
    expect(turnRadiusFor(20, 45)).toBeLessThan(turnRadiusFor(20, 30));
  });
});

describe('predictFlownPath', () => {
  // A 1 km leg east, then 1 km north: the 90° bend a corridor makes.
  const corner = [p(0, 0), p(0, 0.009), p(0.009, 0.009)];

  it('leaves a straight run alone', () => {
    const straight = [p(0, 0), p(0, 0.005), p(0, 0.01)];
    const { cuts } = predictFlownPath(straight, 40);
    expect(cuts).toHaveLength(0);
  });

  it('cuts the corner rather than flying over the waypoint', () => {
    const { path, cuts } = predictFlownPath(corner, 40);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.turnDeg).toBeCloseTo(90, 0);
    // Nothing on the track reaches the corner itself.
    const closest = Math.min(...path.map((q) => metres(q, corner[1]!)));
    expect(closest).toBeGreaterThan(5);
  });

  // 90° at radius r passes r·(√2−1) inside the corner: ~16.6 m at r=40.
  it('misses the corner by the amount the geometry dictates', () => {
    const { cuts } = predictFlownPath(corner, 40);
    expect(cuts[0]!.deviationM).toBeCloseTo(40 * (Math.SQRT2 - 1), 0);
  });

  it('cuts deeper the faster the aircraft flies', () => {
    const slow = predictFlownPath(corner, turnRadiusFor(10));
    const fast = predictFlownPath(corner, turnRadiusFor(25));
    expect(fast.cuts[0]!.deviationM).toBeGreaterThan(slow.cuts[0]!.deviationM);
  });

  it('reports the worst corner first', () => {
    const zigzag = [p(0, 0), p(0, 0.009), p(0.009, 0.009), p(0.009, 0.0135), p(0.0135, 0.0135)];
    const { cuts } = predictFlownPath(zigzag, 40);
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i - 1]!.deviationM).toBeGreaterThanOrEqual(cuts[i]!.deviationM);
    }
  });

  it('tracks wide when the legs are too short to fit the turn', () => {
    // 40 m legs cannot contain a 200 m radius; the aircraft just goes wide.
    const tight = [p(0, 0), p(0, 0.00036), p(0.00036, 0.00036)];
    const { path } = predictFlownPath(tight, 200);
    expect(path.every((q) => Number.isFinite(q.lat) && Number.isFinite(q.lng))).toBe(true);
  });

  it('passes short paths straight through', () => {
    expect(predictFlownPath([p(0, 0), p(0, 1)], 40).path).toHaveLength(2);
    expect(predictFlownPath([], 40).path).toHaveLength(0);
  });
});

describe('coverageGaps', () => {
  // The camera sees half the swath either side of the line. Cut deeper than
  // that and the ground the plan promised is never photographed.
  it('flags only the corners that leave the swath', () => {
    const cuts = [
      { index: 1, deviationM: 45, turnDeg: 90 },
      { index: 2, deviationM: 12, turnDeg: 30 },
    ];
    expect(coverageGaps(cuts, 60).map((c) => c.index)).toEqual([1]);
  });

  it('finds none when the swath is wide enough', () => {
    expect(coverageGaps([{ index: 1, deviationM: 20, turnDeg: 90 }], 200)).toHaveLength(0);
  });
});
