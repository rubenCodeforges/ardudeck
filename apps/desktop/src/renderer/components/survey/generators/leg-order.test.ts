import { describe, it, expect } from 'vitest';
import { generateCorridor } from './corridor-generator';
import { generateGrid } from './grid-generator';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type LatLng } from '../survey-types';

const cfg = (polygon: LatLng[], over: Partial<SurveyConfig> = {}): SurveyConfig => ({
  ...DEFAULT_SURVEY_CONFIG,
  polygon,
  ...over,
});

const LINE: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.02 }];
const SQUARE: LatLng[] = [
  { lat: 47.0, lng: 8.0 },
  { lat: 47.0, lng: 8.004 },
  { lat: 47.0027, lng: 8.004 },
  { lat: 47.0027, lng: 8.0 },
];

describe('line order', () => {
  it('marks where every corridor line begins', () => {
    const r = generateCorridor(cfg(LINE, {
      pattern: 'corridor', corridorStrips: 5, corridorWidth: 300, corridorMode: 'plane', overshoot: 0,
    }));
    expect(r.legStarts).toHaveLength(5);
    expect(r.legStarts![0]).toBe(0);
    for (const i of r.legStarts!) expect(r.waypoints[i]).toBeDefined();
  });

  // The whole point of the badges: the order on the map is the order flown.
  it('the marked starts follow the flown order, not the drawn order', () => {
    const skipping = generateCorridor(cfg(LINE, {
      pattern: 'corridor', corridorStrips: 5, corridorWidth: 300, corridorMode: 'plane',
      speed: 25, overshoot: 0, stripOrder: 'auto',
    }));
    const inOrder = generateCorridor(cfg(LINE, {
      pattern: 'corridor', corridorStrips: 5, corridorWidth: 300, corridorMode: 'plane',
      speed: 25, overshoot: 0, stripOrder: 'sequential',
    }));
    const lat = (r: typeof skipping, i: number) => r.waypoints[r.legStarts![i]!]!.lat;
    // Flown in order, the lines step across one at a time.
    const steps = [1, 2, 3, 4].map((i) => Math.abs(lat(inOrder, i) - lat(inOrder, i - 1)));
    expect(Math.max(...steps)).toBeCloseTo(Math.min(...steps), 9);
    // Skipping, the first hop is wider than one line spacing.
    expect(Math.abs(lat(skipping, 1) - lat(skipping, 0)))
      .toBeGreaterThan(Math.abs(lat(inOrder, 1) - lat(inOrder, 0)));
  });

  it('marks every grid line too', () => {
    const r = generateGrid(cfg(SQUARE, { gridAngle: 0 }));
    expect(r.legStarts!.length).toBe(r.stats.lineCount);
    expect(r.legStarts![0]).toBe(0);
  });

  it('a sequential corridor is flown 1, 2, 3', () => {
    const r = generateCorridor(cfg(LINE, {
      pattern: 'corridor', corridorStrips: 4, corridorWidth: 300, corridorMode: 'plane',
      speed: 25, overshoot: 0, stripOrder: 'sequential',
    }));
    const lats = r.legStarts!.map((i) => r.waypoints[i]!.lat);
    const sorted = [...lats].sort((a, b) => a - b);
    expect(lats).toEqual(sorted);
  });
});
