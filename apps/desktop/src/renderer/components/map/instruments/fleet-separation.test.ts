import { describe, it, expect } from 'vitest';
import { separationPairs, separationTone, nearestNeighbour, SEPARATION_STALE_MS } from './fleet-separation';

const NOW = 1_000_000;
const v = (key: string, lat: number, lon: number, alt: number, lastUpdate: number | null = NOW) => ({
  key,
  label: key,
  position: [lat, lon] as [number, number],
  altitudeMsl: alt,
  lastUpdate,
});

describe('separationPairs', () => {
  it('returns every pair, closest first, with slant distance', () => {
    // 0.0001 deg latitude is about 11.1 m
    const pairs = separationPairs([v('A', 0, 0, 100), v('B', 0.0001, 0, 100), v('C', 0.001, 0, 100)], NOW);
    expect(pairs).toHaveLength(3);
    expect([pairs[0]!.a, pairs[0]!.b]).toEqual(['A', 'B']);
    expect(pairs[0]!.distanceM).toBeCloseTo(11.1, 0);
  });

  it('includes the altitude difference', () => {
    const [p] = separationPairs([v('A', 0, 0, 100), v('B', 0, 0, 130)], NOW);
    expect(p!.horizontalM).toBe(0);
    expect(p!.distanceM).toBe(30);
  });

  it('skips vehicles without a position or with stale telemetry', () => {
    const pairs = separationPairs([
      v('A', 0, 0, 100),
      { ...v('B', 0, 0, 100), position: null },
      v('C', 0, 0, 100, NOW - SEPARATION_STALE_MS - 1),
      v('D', 0, 0, 100, null),
    ], NOW);
    expect(pairs).toHaveLength(0);
  });
});

describe('separationTone', () => {
  it('is danger inside the minimum and warn inside 1.5x', () => {
    expect(separationTone(9, 10)).toBe('danger');
    expect(separationTone(14, 10)).toBe('warn');
    expect(separationTone(15, 10)).toBe('ok');
  });
});

describe('nearestNeighbour', () => {
  it('returns the closest pair that involves the vehicle', () => {
    const pairs = separationPairs([v('A', 0, 0, 100), v('B', 0.0001, 0, 100), v('C', 0.0003, 0, 100)], NOW);
    expect(nearestNeighbour(pairs, 'C')?.otherLabel).toBe('B');
    expect(nearestNeighbour(pairs, 'A')?.otherLabel).toBe('B');
    expect(nearestNeighbour(pairs, 'X')).toBeNull();
  });
});
