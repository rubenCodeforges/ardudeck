import { describe, it, expect, beforeEach } from 'vitest';
import { useSurveyStore } from './survey-store';
import type { LatLng } from '../components/survey/survey-types';

const p = (lat: number, lng: number): LatLng => ({ lat, lng });
const metres = (a: LatLng, b: LatLng) =>
  Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

/** A trunk running east, with one spur hanging north off its midpoint. */
const trunk = [p(53.52, 9.30), p(53.52, 9.32)];
const spur = [p(53.52, 9.31), p(53.53, 9.31)];

const branches = () => useSurveyStore.getState().config.corridorBranches!;

describe('dragging a corridor branch vertex', () => {
  beforeEach(() => {
    useSurveyStore.setState({
      polygon: trunk.map((q) => ({ ...q })),
      geometryLocked: false,
      polygonEditMode: true,
      config: { ...useSurveyStore.getState().config, corridorBranches: [spur.map((q) => ({ ...q }))] },
    });
  });

  // Dragging the junction used to write the raw cursor position, so the spur
  // came away from the trunk and the corridor generated in two pieces.
  it('keeps the junction vertex on the trunk', () => {
    useSurveyStore.getState().updateBranchVertex(0, 0, 53.525, 9.315);
    const junction = branches()[0]![0]!;
    expect(metres(junction, { lat: 53.52, lng: junction.lng })).toBeLessThan(0.5);
  });

  it('still lets the junction slide along the trunk', () => {
    useSurveyStore.getState().updateBranchVertex(0, 0, 53.521, 9.318);
    const junction = branches()[0]![0]!;
    expect(junction.lng).toBeCloseTo(9.318, 4);
  });

  it('leaves the far end free to go where it is put', () => {
    useSurveyStore.getState().updateBranchVertex(0, 1, 53.54, 9.305);
    const tip = branches()[0]![1]!;
    expect(tip.lat).toBeCloseTo(53.54, 6);
    expect(tip.lng).toBeCloseTo(9.305, 6);
  });

  it('clamps a junction dragged past the end of the trunk onto it', () => {
    useSurveyStore.getState().updateBranchVertex(0, 0, 53.52, 9.40);
    const junction = branches()[0]![0]!;
    expect(junction.lng).toBeLessThanOrEqual(9.32 + 1e-9);
  });

  it('refuses to move anything while the shape is locked', () => {
    useSurveyStore.setState({ geometryLocked: true });
    useSurveyStore.getState().updateBranchVertex(0, 0, 53.525, 9.315);
    expect(branches()[0]![0]!).toEqual(spur[0]);
  });
});
