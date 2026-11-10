import { describe, expect, it } from 'vitest';
import { buildFenceItems, parseFenceItems, type FenceItem } from './fence-types';

const vertex = (seq: number, command: number, count: number, lat: number, lon: number): FenceItem =>
  ({ seq, command, frame: 0, param1: count, param2: 0, param3: 0, param4: 0, latitude: lat, longitude: lon, altitude: 0 });

describe('fence items', () => {
  it('reads polygons as ArduPilot sends them, with the vertex count on every vertex', () => {
    const items = [
      vertex(0, 5002, 3, 1, 1), vertex(1, 5002, 3, 1, 2), vertex(2, 5002, 3, 2, 2),
      vertex(3, 5001, 4, 0, 0), vertex(4, 5001, 4, 0, 5), vertex(5, 5001, 4, 5, 5), vertex(6, 5001, 4, 5, 0),
    ];
    const { polygons } = parseFenceItems(items);
    expect(polygons.map((p) => [p.type, p.vertices.length])).toEqual([['exclusion', 3], ['inclusion', 4]]);
  });

  it('still reads older files with the count on the first vertex only', () => {
    const items = [vertex(0, 5002, 3, 1, 1), vertex(1, 5002, 0, 1, 2), vertex(2, 5002, 0, 2, 2)];
    expect(parseFenceItems(items).polygons[0]!.vertices).toHaveLength(3);
  });

  it('splits two back-to-back polygons of the same type by their count', () => {
    const items = [
      vertex(0, 5002, 3, 1, 1), vertex(1, 5002, 3, 1, 2), vertex(2, 5002, 3, 2, 2),
      vertex(3, 5002, 3, 3, 3), vertex(4, 5002, 3, 3, 4), vertex(5, 5002, 3, 4, 4),
    ];
    expect(parseFenceItems(items).polygons.map((p) => p.vertices.length)).toEqual([3, 3]);
  });

  it('writes the vertex count on every vertex and round-trips', () => {
    const polygons = [{ id: 'p', type: 'exclusion' as const, vertices: [{ seq: 0, lat: 1, lon: 1 }, { seq: 1, lat: 1, lon: 2 }, { seq: 2, lat: 2, lon: 2 }, { seq: 3, lat: 2, lon: 1 }] }];
    const items = buildFenceItems(polygons, [], null);
    expect(items.filter((i) => i.command === 5002).map((i) => i.param1)).toEqual([4, 4, 4, 4]);
    expect(parseFenceItems(items).polygons[0]!.vertices.map((v) => [v.lat, v.lon])).toEqual([[1, 1], [1, 2], [2, 2], [2, 1]]);
  });
});
