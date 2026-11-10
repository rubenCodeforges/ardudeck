import { describe, it, expect } from 'vitest';
import { heightFromTags, buildBuildingsGeometry, type Building } from './svt-buildings';
import { metersPerDegLon, type ElevationGrid } from './svt-terrain';

function flat(value: number): ElevationGrid {
  return { centerLat: 47, centerLon: 8, halfSizeM: 5000, res: 4, elev: new Float32Array(16).fill(value), mPerDegLon: metersPerDegLon(47) };
}

// a 20 m square next to the grid centre
const square: Array<[number, number]> = [[8, 47], [8.00026, 47], [8.00026, 47.00018], [8, 47.00018], [8, 47]];

describe('building heights from OSM tags', () => {
  it('prefers an explicit height, in metres or feet', () => {
    expect(heightFromTags({ building: 'yes', height: '23.5' }).heightM).toBe(23.5);
    expect(heightFromTags({ building: 'yes', height: '33 ft' }).heightM).toBeCloseTo(10.06, 1);
  });

  it('falls back to levels, then to the building type, then a default', () => {
    expect(heightFromTags({ building: 'yes', 'building:levels': '4' }).heightM).toBe(13);
    expect(heightFromTags({ building: 'garage' }).heightM).toBe(3);
    expect(heightFromTags({ building: 'yes' }).heightM).toBe(8);
  });

  it('lifts parts that start above the ground', () => {
    expect(heightFromTags({ 'building:part': 'yes', height: '30', min_height: '12' })).toEqual({ heightM: 30, minHeightM: 12 });
  });
});

describe('building geometry', () => {
  it('stands a building on the terrain with walls and a flat roof at its height', () => {
    const b: Building = { rings: [square], heightM: 10, minHeightM: 0 };
    const g = buildBuildingsGeometry([b], flat(400), { lat: 47, lon: 8 })!;
    const ys = Array.from(g.getAttribute('position').array).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(410, 3);
    // sunk a little under the ground so a slope shows no gap
    expect(Math.min(...ys)).toBeLessThan(400);
    // 4 walls of 2 triangles plus a 2-triangle roof
    expect(g.getAttribute('position').count).toBe((4 * 2 + 2) * 3);
  });

  it('leaves out buildings beyond the radius', () => {
    const far: Building = { rings: [square.map(([lon, lat]) => [lon + 0.1, lat] as [number, number])], heightM: 10, minHeightM: 0 };
    expect(buildBuildingsGeometry([far], flat(0), { lat: 47, lon: 8 })).toBeNull();
  });

  it('leaves out buildings a scene model stands in', () => {
    const b: Building = { rings: [square], heightM: 10, minHeightM: 0 };
    const model = { rings: [], center: { lat: 47.0001, lng: 8.0001 }, radiusM: 30 };
    const away = { rings: [], center: { lat: 47.01, lng: 8 }, radiusM: 30 };
    expect(buildBuildingsGeometry([b], flat(0), { lat: 47, lon: 8 }, undefined, [model])).toBeNull();
    expect(buildBuildingsGeometry([b], flat(0), { lat: 47, lon: 8 }, undefined, [away])).not.toBeNull();
  });
});
