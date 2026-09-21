import { describe, it, expect, beforeEach } from 'vitest';
import { useSurveyStore } from './survey-store';
import { useMissionStore } from './mission-store';

const square = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.51, lng: -0.1 },
  { lat: 51.51, lng: -0.09 },
  { lat: 51.5, lng: -0.09 },
];

const poly = () => useSurveyStore.getState().polygon;

describe('survey geometry lock', () => {
  beforeEach(() => {
    useMissionStore.getState().reset();
    useSurveyStore.setState({
      polygon: square.map((p) => ({ ...p })),
      geometryLocked: false,
      polygonEditMode: false,
      editingGroupId: null,
      config: { ...useSurveyStore.getState().config, corridorBranches: [[{ lat: 51.5, lng: -0.1 }, { lat: 51.5, lng: -0.08 }]] },
    });
  });

  it('refuses every geometry edit while locked', () => {
    useSurveyStore.getState().setGeometryLocked(true);
    const before = JSON.stringify(poly());

    useSurveyStore.getState().updateVertex(0, 52, 1);
    useSurveyStore.getState().insertVertexAfter(0, 51.505, -0.095);
    useSurveyStore.getState().removeVertex(1);

    expect(JSON.stringify(poly())).toBe(before);
    expect(poly()).toHaveLength(4);
  });

  it('pins corridor branches too', () => {
    useSurveyStore.getState().setGeometryLocked(true);
    const before = JSON.stringify(useSurveyStore.getState().config.corridorBranches);

    useSurveyStore.getState().updateBranchVertex(0, 1, 53, 2);
    useSurveyStore.getState().removeBranchVertex(0, 0);

    expect(JSON.stringify(useSurveyStore.getState().config.corridorBranches)).toBe(before);
  });

  it('lets the same edits through once unlocked', () => {
    useSurveyStore.getState().setGeometryLocked(true);
    useSurveyStore.getState().setGeometryLocked(false);

    useSurveyStore.getState().updateVertex(0, 52, 1);

    expect(poly()![0]).toEqual({ lat: 52, lng: 1 });
  });

  // Locking is a UI flag, not a generator input, so it must not make a
  // committed survey look stale and trigger a rebuild of its waypoints.
  it('does not disturb the panorama tangents', () => {
    useSurveyStore.getState().setGeometryLocked(true);
    useSurveyStore.getState().setPanoramaTangent(0, { inX: 1, inY: 1, outX: -1, outY: -1 });
    expect(useSurveyStore.getState().config.panoramaTangents ?? {}).toEqual({});
  });

  it('leaves polygon-edit mode when it locks', () => {
    useSurveyStore.setState({ polygonEditMode: true });
    useSurveyStore.getState().setGeometryLocked(true);
    expect(useSurveyStore.getState().polygonEditMode).toBe(false);
  });
});
