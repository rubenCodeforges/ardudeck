import { describe, it, expect } from 'vitest';
import { withLeadIn } from './survey-leadin';
import { generateCorridor } from './generators/corridor-generator';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type LatLng } from './survey-types';

const metres = (a: LatLng, b: LatLng) =>
  Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

const line = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }];

describe('withLeadIn', () => {
  it('adds one point back along the first leg', () => {
    const out = withLeadIn(line, 100);
    expect(out).toHaveLength(4);
    expect(metres(out[0]!, line[0]!)).toBeCloseTo(100, 0);
    // Behind the start, not past it: still heading the same way.
    expect(out[0]!.lng).toBeLessThan(line[0]!.lng);
    expect(out[0]!.lat).toBeCloseTo(0, 9);
  });

  it('does nothing at zero', () => {
    expect(withLeadIn(line, 0)).toEqual(line);
  });

  it('does nothing without a heading to line up with', () => {
    expect(withLeadIn([{ lat: 1, lng: 1 }], 100)).toHaveLength(1);
    expect(withLeadIn([{ lat: 1, lng: 1 }, { lat: 1, lng: 1 }], 100)).toHaveLength(2);
  });
});

describe('a corridor with a lead-in', () => {
  const cfg = (over: Partial<SurveyConfig>): SurveyConfig => ({
    ...DEFAULT_SURVEY_CONFIG,
    polygon: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.02 }],
    pattern: 'corridor',
    corridorStrips: 2,
    corridorMode: 'plane',
    overshoot: 0,
    ...over,
  });

  it('starts further out, and covers the same lines', () => {
    const plain = generateCorridor(cfg({}));
    const led = generateCorridor(cfg({ leadIn: 120 }));
    expect(led.waypoints).toHaveLength(plain.waypoints.length + 1);
    expect(metres(led.waypoints[0]!, plain.waypoints[0]!)).toBeCloseTo(120, 0);
    expect(led.waypoints.slice(1)).toEqual(plain.waypoints);
  });

  // The badges number the lines; a point inserted in front must not shift them.
  it('keeps the line markers on the lines', () => {
    const led = generateCorridor(cfg({ leadIn: 120 }));
    const plain = generateCorridor(cfg({}));
    expect(led.legStarts!.map((i) => led.waypoints[i]))
      .toEqual(plain.legStarts!.map((i) => plain.waypoints[i]));
  });
});
