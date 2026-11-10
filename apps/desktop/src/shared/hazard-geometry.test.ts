import { describe, expect, it } from 'vitest';
import { crossingLegs, legCrossesZone, routeAround } from './hazard-geometry';
import type { LatLon, Hazard } from './hazard-types';

// A 200 m x 200 m square near Zurich, as a polygon and as a circle of 100 m.
const lat0 = 47.4;
const lon0 = 8.5;
const dLat = (m: number) => m / 111_320;
const dLon = (m: number) => m / (111_320 * Math.cos((lat0 * Math.PI) / 180));
const at = (eastM: number, northM: number): LatLon => ({ lat: lat0 + dLat(northM), lon: lon0 + dLon(eastM) });
const base = { id: 'z', name: 'Power line', uploadAsFence: false, createdAt: 0 };
const square: Hazard = { ...base, bufferM: 15, shape: { kind: 'polygon', points: [at(-100, -100), at(100, -100), at(100, 100), at(-100, 100)] } };
const circle: Hazard = { ...base, bufferM: 15, shape: { kind: 'circle', center: at(0, 0), radiusM: 100 } };

describe('hazard geometry', () => {
  it('sees a leg straight through the zone', () => {
    expect(legCrossesZone(at(-300, 0), at(300, 0), square)).toBe(true);
    expect(legCrossesZone(at(-300, 0), at(300, 0), circle)).toBe(true);
  });
  it('counts the buffer: 10 m off the edge crosses, 30 m off does not', () => {
    expect(legCrossesZone(at(-300, 110), at(300, 110), square)).toBe(true);
    expect(legCrossesZone(at(-300, 130), at(300, 130), square)).toBe(false);
    expect(legCrossesZone(at(-300, 110), at(300, 110), circle)).toBe(true);
    expect(legCrossesZone(at(-300, 130), at(300, 130), circle)).toBe(false);
  });
  it('flags a leg that starts inside', () => {
    expect(legCrossesZone(at(0, 0), at(500, 500), square)).toBe(true);
  });
  it('names the crossing legs of a route', () => {
    const route = [at(-300, -300), at(-300, 0), at(300, 0), at(300, 300)];
    expect(crossingLegs(route, [square]).map((c) => c.leg)).toEqual([1]);
  });

  for (const zone of [square, circle]) {
    it(`routes around the ${zone.shape.kind} and every detour leg stays clear`, () => {
      const a = at(-300, 10);
      const b = at(300, 10);
      const detour = routeAround(a, b, zone)!;
      expect(detour.length).toBeGreaterThan(0);
      const path = [a, ...detour, b];
      for (let i = 0; i + 1 < path.length; i++) expect(legCrossesZone(path[i]!, path[i + 1]!, zone)).toBe(false);
    });
  }

  it('needs no detour for a clear leg, and gives up when an end is inside', () => {
    expect(routeAround(at(-300, 300), at(300, 300), square)).toEqual([]);
    expect(routeAround(at(0, 0), at(300, 300), square)).toBeNull();
  });
});
