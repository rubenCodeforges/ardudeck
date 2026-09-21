import { describe, it, expect } from 'vitest';
import { nearestLeg, projectOnSegment, type LegPoint } from './insert-target';

/** 1 unit of lat/lon = 1px, so screen distances read straight off the fixture. */
const project = (lat: number, lon: number) => ({ x: lon, y: lat });

const leg = (seq: number, latitude: number, longitude: number, groupId?: string): LegPoint =>
  ({ seq, latitude, longitude, ...(groupId ? { groupId } : {}) });

describe('projectOnSegment', () => {
  it('clamps past either end instead of running off the line', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(projectOnSegment({ x: -5, y: 0 }, a, b)).toEqual({ t: 0, distance: 5 });
    expect(projectOnSegment({ x: 15, y: 0 }, a, b)).toEqual({ t: 1, distance: 5 });
    expect(projectOnSegment({ x: 5, y: 3 }, a, b)).toEqual({ t: 0.5, distance: 3 });
  });

  it('survives a zero-length leg', () => {
    const a = { x: 4, y: 4 };
    expect(projectOnSegment({ x: 4, y: 7 }, a, a)).toEqual({ t: 0, distance: 3 });
  });
});

describe('nearestLeg', () => {
  // The survey case: parallel legs a few px apart. Picking by z-order gave
  // whichever band was on top; it has to be the one under the cursor.
  const survey = [
    leg(0, 0, 0, 'survey'),
    leg(1, 0, 100, 'survey'),
    leg(2, 8, 100, 'survey'),
    leg(3, 8, 0, 'survey'),
    leg(4, 16, 0, 'survey'),
    leg(5, 16, 100, 'survey'),
  ];

  it('picks the closest parallel leg, not the first or last', () => {
    const t = nearestLeg(survey, { x: 50, y: 9 }, project, 12);
    expect(t?.afterSeq).toBe(2);
    expect(t?.lat).toBeCloseTo(8, 6);
  });

  it('snaps the insert onto the leg rather than the cursor', () => {
    const t = nearestLeg(survey, { x: 30, y: 3 }, project, 12);
    expect(t?.afterSeq).toBe(0);
    expect(t?.lat).toBeCloseTo(0, 6);
    expect(t?.lon).toBeCloseTo(30, 6);
    expect(t?.distancePx).toBeCloseTo(3, 6);
  });

  it('reports nothing when the click is off every leg', () => {
    expect(nearestLeg(survey, { x: 50, y: 60 }, project, 12)).toBeNull();
  });

  it('carries the group when both ends share one', () => {
    expect(nearestLeg(survey, { x: 50, y: 1 }, project, 12)?.groupId).toBe('survey');
  });

  it('carries no group across a boundary between two of them', () => {
    const mixed = [leg(0, 0, 0, 'survey'), leg(1, 0, 50, 'survey'), leg(2, 0, 100, 'manual')];
    expect(nearestLeg(mixed, { x: 20, y: 0 }, project, 12)?.groupId).toBe('survey');
    expect(nearestLeg(mixed, { x: 80, y: 0 }, project, 12)?.groupId).toBeUndefined();
  });

  it('needs two points to make a leg', () => {
    expect(nearestLeg([leg(0, 0, 0)], { x: 0, y: 0 }, project, 12)).toBeNull();
    expect(nearestLeg([], { x: 0, y: 0 }, project, 12)).toBeNull();
  });

  it('holds the pixel tolerance at the boundary', () => {
    const line = [leg(0, 0, 0), leg(1, 0, 100)];
    expect(nearestLeg(line, { x: 50, y: 12 }, project, 12)).not.toBeNull();
    expect(nearestLeg(line, { x: 50, y: 12.5 }, project, 12)).toBeNull();
  });
});
