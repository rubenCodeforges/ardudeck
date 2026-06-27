import { describe, it, expect } from 'vitest';
import { sampleWind, windColor, windVectorFromUV, compassPoint, computeWindRose, convertSpeed, nextUnit, formatWindSpeed, windUnitFromPreference } from './wind-field';
import type { WindField, WindFrame } from '../../../../shared/wind-types';

// 2x2 grid over a 1x1 deg box, row 0 = south, col 0 = west.
const field: WindField = {
  width: 2,
  height: 2,
  bbox: { south: 0, north: 1, west: 0, east: 1 },
  altitudeM: 120,
  frames: [],
  speedMax: 10,
  modelLabel: 'test',
  fetchedAt: 0,
};
//   idx = row*width + col -> [SW, SE, NW, NE]
const frame: WindFrame = { time: 't', u: [0, 10, 0, 10], v: [0, 0, 0, 0] };

describe('sampleWind', () => {
  it('returns the exact cell value at a corner', () => {
    expect(sampleWind(field, frame, 0, 0)).toEqual({ u: 0, v: 0 });
    expect(sampleWind(field, frame, 0, 1)).toEqual({ u: 10, v: 0 });
  });

  it('bilinearly interpolates across the cell', () => {
    const r = sampleWind(field, frame, 0, 0.5);
    expect(r).not.toBeNull();
    expect(r!.u).toBeCloseTo(5, 6);
  });

  it('returns null outside the bbox', () => {
    expect(sampleWind(field, frame, 2, 2)).toBeNull();
    expect(sampleWind(field, frame, -0.1, 0.5)).toBeNull();
  });
});

describe('windColor', () => {
  it('returns an rgb string and clamps the domain', () => {
    expect(windColor(0)).toMatch(/^rgb\(/);
    expect(windColor(-5)).toBe(windColor(0));
    expect(windColor(100)).toBe(windColor(28));
  });

  it('shifts hue with speed', () => {
    expect(windColor(2)).not.toBe(windColor(20));
  });
});

describe('windVectorFromUV', () => {
  it('south-blowing wind (u=0,v=-10) is FROM the north (0 deg)', () => {
    const r = windVectorFromUV(0, -10);
    expect(r.speed).toBeCloseTo(10, 6);
    expect(r.dirFromDeg).toBeCloseTo(0, 4);
  });
  it('east-blowing wind (u=10,v=0) is FROM the west (270 deg)', () => {
    expect(windVectorFromUV(10, 0).dirFromDeg).toBeCloseTo(270, 4);
  });
});

describe('compassPoint', () => {
  it('labels cardinal directions', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(359)).toBe('N');
  });
});

describe('computeWindRose', () => {
  // 2x2 field, all cells uniform: wind from the north every frame.
  const roseField: WindField = {
    width: 2, height: 2, bbox: { south: 0, north: 1, west: 0, east: 1 }, altitudeM: 120,
    speedMax: 10, modelLabel: 't', fetchedAt: 0,
    frames: [
      { time: 'a', u: [0, 0, 0, 0], v: [-5, -5, -5, -5] },
      { time: 'b', u: [0, 0, 0, 0], v: [-7, -7, -7, -7] },
    ],
  };
  it('concentrates frequency in the north sector', () => {
    const rose = computeWindRose(roseField, 0.5, 0.5, 16);
    expect(rose).not.toBeNull();
    expect(rose!.samples).toBe(2);
    const north = rose!.bins[0]!; // sector centred on N
    expect(north.freq).toBeCloseTo(1, 6);
    expect(north.meanSpeed).toBeCloseTo(6, 6);
  });
  it('returns null outside the field', () => {
    expect(computeWindRose(roseField, 9, 9)).toBeNull();
  });

  it('windows to a frame range', () => {
    // Only frame 0 (speed 5) -> north sector mean speed 5, not the 6 average.
    const rose = computeWindRose(roseField, 0.5, 0.5, 16, 0, 1);
    expect(rose!.samples).toBe(1);
    expect(rose!.bins[0]!.meanSpeed).toBeCloseTo(5, 6);
  });
});

describe('units', () => {
  it('converts m/s to other units', () => {
    expect(convertSpeed(10, 'ms')).toBeCloseTo(10, 6);
    expect(convertSpeed(10, 'kt')).toBeCloseTo(19.4384, 3);
    expect(convertSpeed(10, 'kmh')).toBeCloseTo(36, 6);
    expect(convertSpeed(10, 'mph')).toBeCloseTo(22.3694, 3);
  });
  it('cycles m/s -> kt -> mph -> km/h -> m/s', () => {
    expect(nextUnit('ms')).toBe('kt');
    expect(nextUnit('kt')).toBe('mph');
    expect(nextUnit('mph')).toBe('kmh');
    expect(nextUnit('kmh')).toBe('ms');
  });
  it('seeds the session unit from the saved wind speed preference', () => {
    expect(windUnitFromPreference('mps')).toBe('ms');
    expect(windUnitFromPreference('kph')).toBe('kmh');
    expect(windUnitFromPreference('mph')).toBe('mph');
    expect(windUnitFromPreference('kt')).toBe('kt');
  });
  it('formats with the right precision + label', () => {
    expect(formatWindSpeed(5.234, 'ms')).toBe('5.2 m/s');
    expect(formatWindSpeed(5.234, 'kt')).toBe('10 kt');
  });
});
