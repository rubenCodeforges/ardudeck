import { describe, expect, it } from 'vitest';
import { buildingExcluded, exclusionGeoJson, exclusionZonesFor, ringsOverlap } from './scene-model-exclusion';
import { offsetLatLng } from './scene-model-placement';

const c = { lat: 47, lng: 8 };
/** A square building [lon, lat] ring centred east/north metres from c, half-size h. */
function building(east: number, north: number, h: number): Array<[number, number]> {
  return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dy]) => {
    const p = offsetLatLng(c, east + dx!, north + dy!);
    return [p.lng, p.lat];
  });
}
const square = (east: number, north: number, h: number) =>
  [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dy]) => offsetLatLng(c, east + dx!, north + dy!));

describe('ringsOverlap', () => {
  const sq = (x: number, y: number, h: number) => [{ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }];
  it('sees crossing edges, containment both ways, and separation', () => {
    expect(ringsOverlap(sq(0, 0, 10), sq(15, 0, 10))).toBe(true);
    expect(ringsOverlap(sq(0, 0, 10), sq(0, 0, 2))).toBe(true);
    expect(ringsOverlap(sq(0, 0, 2), sq(0, 0, 10))).toBe(true);
    expect(ringsOverlap(sq(0, 0, 10), sq(30, 0, 10))).toBe(false);
  });
});

describe('buildingExcluded', () => {
  const footprintZone = { rings: [square(0, 0, 20)], center: c, radiusM: 30 };

  it('drops a building whose ring crosses a footprint', () => {
    expect(buildingExcluded(building(25, 0, 10), [footprintZone])).toBe(true);
  });

  it('drops a building inside a footprint, and one that encloses it', () => {
    expect(buildingExcluded(building(0, 0, 5), [footprintZone])).toBe(true);
    expect(buildingExcluded(building(0, 0, 50), [footprintZone])).toBe(true);
  });

  it('keeps a building clear of the footprint', () => {
    expect(buildingExcluded(building(60, 0, 10), [footprintZone])).toBe(false);
  });

  it('uses the radius when the model has no footprint', () => {
    const zone = { rings: [], center: c, radiusM: 30 };
    expect(buildingExcluded(building(35, 0, 10), [zone])).toBe(true);
    expect(buildingExcluded(building(0, 0, 100), [zone])).toBe(true);
    expect(buildingExcluded(building(60, 0, 10), [zone])).toBe(false);
  });
});

describe('exclusionZonesFor', () => {
  it('takes footprints, the loaded radius, or 30 m', () => {
    const zones = exclusionZonesFor(
      [
        { key: 'a', origin: c, footprints: [square(0, 0, 5)] },
        { key: 'b', origin: c },
        { key: 'c', origin: c },
      ],
      (k) => (k === 'b' ? 80 : undefined),
    );
    expect(zones.map((z) => [z.rings.length, z.radiusM])).toEqual([[1, 30], [0, 80], [0, 30]]);
    const gj = exclusionGeoJson(zones, 16);
    expect(gj.features).toHaveLength(3);
    expect(gj.features[1]!.geometry.coordinates[0]).toHaveLength(17);
  });
});
