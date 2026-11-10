// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { legWindKind } from './WindLegsOverlay';
import { legWinds } from '../../utils/flight-briefing';

describe('wind on mission legs (#54)', () => {
  const north = [{ lat: 0, lng: 0 }, { lat: 0.01, lng: 0 }];
  const south = [{ lat: 0.01, lng: 0 }, { lat: 0, lng: 0 }];
  const east = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }];
  const fromNorth = (speedMs: number) => () => ({ speedMs, fromDeg: 0 });

  it('classifies head, tail, cross and blocked legs', () => {
    expect(legWindKind(legWinds(north, 15, fromNorth(5), null)[0]!)).toBe('head');
    expect(legWindKind(legWinds(south, 15, fromNorth(5), null)[0]!)).toBe('tail');
    expect(legWindKind(legWinds(east, 15, fromNorth(5), null)[0]!)).toBe('cross');
    expect(legWindKind(legWinds(north, 10, fromNorth(12), null)[0]!)).toBe('blocked');
  });

  it('gives the ground speed on the leg and marks which wind it used', () => {
    const [leg] = legWinds(north, 15, fromNorth(5), null);
    expect(leg!.groundSpeedMs).toBeCloseTo(10, 6);
    expect(leg!.headwindMs).toBeCloseTo(5, 6);
    expect(leg!.source).toBe('layer');
    expect(legWinds(north, 15, () => null, { speedMs: 5, fromDeg: 0 })[0]!.source).toBe('surface');
    expect(legWinds(north, 15, () => null, null)[0]).toBeNull();
  });
});
