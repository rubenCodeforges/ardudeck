import { describe, it, expect } from 'vitest';
import { splitCorridorIntoSections, sectionCountForEndurance, centrelineLengthM } from './corridor-sections';
import type { LatLng } from './survey-types';

/** A straight east-west centreline about 2.2 km long at this latitude. */
const CENTRELINE: LatLng[] = [
  { lat: 53.5, lng: 9.0 },
  { lat: 53.5, lng: 9.03 },
];

/** Two parallel passes over that centreline, flown out and back. */
function boustrophedon(): LatLng[] {
  return [
    { lat: 53.4995, lng: 9.0 },
    { lat: 53.4995, lng: 9.03 },
    { lat: 53.5005, lng: 9.03 },
    { lat: 53.5005, lng: 9.0 },
  ];
}

describe('centrelineLengthM', () => {
  it('measures a straight line', () => {
    expect(centrelineLengthM(CENTRELINE)).toBeGreaterThan(1900);
    expect(centrelineLengthM(CENTRELINE)).toBeLessThan(2100);
  });

  it('is zero for a degenerate path', () => {
    expect(centrelineLengthM([{ lat: 53.5, lng: 9 }])).toBe(0);
  });
});

describe('splitCorridorIntoSections', () => {
  it('returns the whole path when one section is asked for', () => {
    const out = splitCorridorIntoSections(boustrophedon(), CENTRELINE, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(4);
  });

  it('cuts each pass at the boundary so both sections keep both lines', () => {
    const out = splitCorridorIntoSections(boustrophedon(), CENTRELINE, 2);
    expect(out).toHaveLength(2);
    // Every section must contain points from both passes, which is the whole
    // point: a section is a stretch of corridor, not a subset of lines.
    for (const section of out) {
      const souths = section.filter((p) => p.lat < 53.5).length;
      const norths = section.filter((p) => p.lat > 53.5).length;
      expect(souths).toBeGreaterThan(0);
      expect(norths).toBeGreaterThan(0);
    }
  });

  it('puts the first section west and the last section east', () => {
    const out = splitCorridorIntoSections(boustrophedon(), CENTRELINE, 2);
    const west = Math.max(...out[0]!.map((p) => p.lng));
    const east = Math.min(...out[1]!.map((p) => p.lng));
    expect(west).toBeLessThanOrEqual(east + 1e-9);
  });

  it('covers the full corridor across all sections', () => {
    const out = splitCorridorIntoSections(boustrophedon(), CENTRELINE, 3);
    const all = out.flat();
    expect(Math.min(...all.map((p) => p.lng))).toBeCloseTo(9.0, 4);
    expect(Math.max(...all.map((p) => p.lng))).toBeCloseTo(9.03, 4);
  });

  it('leaves no gap between consecutive sections', () => {
    const out = splitCorridorIntoSections(boustrophedon(), CENTRELINE, 3);
    for (let i = 0; i < out.length - 1; i++) {
      const endOfThis = Math.max(...out[i]!.map((p) => p.lng));
      const startOfNext = Math.min(...out[i + 1]!.map((p) => p.lng));
      expect(startOfNext).toBeLessThanOrEqual(endOfThis + 1e-6);
    }
  });

  it('handles an empty or single-point path', () => {
    expect(splitCorridorIntoSections([], CENTRELINE, 3)).toEqual([]);
    const one = [{ lat: 53.5, lng: 9.01 }];
    expect(splitCorridorIntoSections(one, CENTRELINE, 3)).toEqual([one]);
  });

  it('falls back to one section when the centreline is degenerate', () => {
    const out = splitCorridorIntoSections(boustrophedon(), [{ lat: 53.5, lng: 9 }], 4);
    expect(out).toHaveLength(1);
  });
});

describe('sectionCountForEndurance', () => {
  it('is one when the whole corridor fits a battery', () => {
    expect(sectionCountForEndurance(boustrophedon(), 15, 30)).toBe(1);
  });

  it('grows as endurance shrinks', () => {
    const few = sectionCountForEndurance(boustrophedon(), 10, 10);
    const many = sectionCountForEndurance(boustrophedon(), 10, 2);
    expect(many).toBeGreaterThan(few);
  });

  it('never returns zero', () => {
    expect(sectionCountForEndurance([], 10, 20)).toBe(1);
    expect(sectionCountForEndurance(boustrophedon(), 0, 0)).toBeGreaterThanOrEqual(1);
  });
});
