import { describe, it, expect, beforeEach } from 'vitest';
import { useSurveyStore } from './survey-store';

const CENTRELINE = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.01 },
];
const BRANCH = [
  { lat: 0, lng: 0.005 },
  { lat: 0.004, lng: 0.005 },
];

describe('adding points to a survey', () => {
  beforeEach(() => {
    useSurveyStore.setState({
      polygon: [...CENTRELINE],
      geometryLocked: false,
      config: { ...useSurveyStore.getState().config, pattern: 'corridor', corridorBranches: [[...BRANCH]] },
    });
  });

  it('inserts a point into the centreline after the given segment', () => {
    useSurveyStore.getState().insertVertexAfter(0, 0, 0.004);
    expect(useSurveyStore.getState().polygon).toEqual([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.004 },
      { lat: 0, lng: 0.01 },
    ]);
  });

  it('inserts a point into a branch', () => {
    useSurveyStore.getState().insertBranchVertexAfter(0, 0, 0.002, 0.005);
    expect(useSurveyStore.getState().config.corridorBranches![0]).toEqual([
      { lat: 0, lng: 0.005 },
      { lat: 0.002, lng: 0.005 },
      { lat: 0.004, lng: 0.005 },
    ]);
  });

  it('leaves the other branches alone', () => {
    const second = [{ lat: 1, lng: 1 }, { lat: 1, lng: 1.001 }];
    useSurveyStore.setState({
      config: { ...useSurveyStore.getState().config, corridorBranches: [[...BRANCH], second] },
    });
    useSurveyStore.getState().insertBranchVertexAfter(0, 0, 0.002, 0.005);
    expect(useSurveyStore.getState().config.corridorBranches![1]).toEqual(second);
  });

  // Locking a survey is what stops fine-tuning from moving the geometry; it
  // has to stop adding to it as well.
  it('refuses while the geometry is locked', () => {
    useSurveyStore.setState({ geometryLocked: true });
    useSurveyStore.getState().insertVertexAfter(0, 0, 0.004);
    useSurveyStore.getState().insertBranchVertexAfter(0, 0, 0.002, 0.005);
    expect(useSurveyStore.getState().polygon).toHaveLength(2);
    expect(useSurveyStore.getState().config.corridorBranches![0]).toHaveLength(2);
  });

  it('ignores an out-of-range branch or vertex', () => {
    useSurveyStore.getState().insertBranchVertexAfter(9, 0, 0, 0);
    useSurveyStore.getState().insertBranchVertexAfter(0, 9, 0, 0);
    expect(useSurveyStore.getState().config.corridorBranches![0]).toHaveLength(2);
  });
});
