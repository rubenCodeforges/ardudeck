import { describe, expect, it } from 'vitest';
import { blockPoints, offsetE7, requestedBits, toInt16 } from './terrain-blocks';

describe('requestedBits', () => {
  it('lists the set bits of the 56-bit mask in order', () => {
    expect(requestedBits(0n)).toEqual([]);
    expect(requestedBits(0b101n)).toEqual([0, 2]);
    expect(requestedBits(1n << 55n)).toEqual([55]);
  });

  it('ignores bits beyond the 56 grids', () => {
    expect(requestedBits(1n << 60n)).toEqual([]);
  });
});

describe('toInt16', () => {
  it('rounds and clamps to the int16 range TERRAIN_DATA carries', () => {
    expect(toInt16(12.4)).toBe(12);
    expect(toInt16(12.6)).toBe(13);
    expect(toInt16(-5.5)).toBe(-5);
    expect(toInt16(99999)).toBe(32767);
    expect(toInt16(-99999)).toBe(-32768);
  });
});

describe('offsetE7', () => {
  it('moves north by about metres / 0.11132 in degE7', () => {
    const o = offsetE7(450000000, 100000000, 100, 0);
    expect(o.latE7 - 450000000).toBeCloseTo(100 * 89.83204953368922, 3);
    expect(o.lonE7).toBe(100000000);
  });

  it('wraps longitude across the antimeridian', () => {
    const o = offsetE7(0, 1799999990, 0, 10000);
    expect(o.lonE7).toBeLessThan(0);
  });

  it('clamps latitude at the poles', () => {
    expect(offsetE7(899999999, 0, 100000, 0).latE7).toBe(900000000);
  });
});

describe('blockPoints', () => {
  it('returns the 16 points of a 4 x 4 sub-block, x along latitude then y along longitude', () => {
    const pts = blockPoints(450000000, 100000000, 100, 0);
    expect(pts).toHaveLength(16);
    expect(pts[0]).toEqual({ lat: 45, lon: 10 });
    // Second point steps along longitude (y), the fifth along latitude (x).
    expect(pts[1]!.lat).toBeCloseTo(45, 9);
    expect(pts[1]!.lon).toBeGreaterThan(10);
    expect(pts[4]!.lat).toBeGreaterThan(45);
    expect(pts[4]!.lon).toBeCloseTo(10, 9);
  });

  it('places grid bit 8 one sub-block north and one east of the origin block (8 x 7 layout)', () => {
    const origin = blockPoints(450000000, 100000000, 100, 0)[0]!;
    const bit8 = blockPoints(450000000, 100000000, 100, 8)[0]!;
    const east = blockPoints(450000000, 100000000, 100, 1)[0]!;
    expect(bit8.lat).toBeGreaterThan(origin.lat);
    expect(bit8.lon).toBeGreaterThan(origin.lon);
    expect(east.lat).toBeCloseTo(origin.lat, 9);
    expect(east.lon).toBeGreaterThan(origin.lon);
  });
});
