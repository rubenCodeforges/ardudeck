import { describe, it, expect, beforeEach } from 'vitest';
import { useMissionStore } from './mission-store';
import { createSurveyGroup } from '../../shared/mission-group-types';
import type { SurveyGroup } from '../../shared/mission-group-types';
import type { MissionItem } from '../../shared/mission-types';
import { MAV_CMD, MAV_FRAME } from '../../shared/mission-types';

const wp = (seq: number, lon: number): MissionItem => ({
  seq, frame: MAV_FRAME.GLOBAL_RELATIVE_ALT, command: MAV_CMD.NAV_WAYPOINT,
  current: false, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0,
  latitude: 51.5, longitude: lon, altitude: 50,
});

const poly = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.51, lng: -0.1 },
  { lat: 51.51, lng: -0.09 },
];

const survey = (name: string) =>
  createSurveyGroup({
    name,
    generatorId: 'builtin.corridor',
    generatorVersion: '1.0.0',
    polygon: poly,
    config: { altitude: 50, corridorBranches: [[{ lat: 51.5, lng: -0.1 }, { lat: 51.5, lng: -0.08 }]] },
  });

const store = () => useMissionStore.getState();
const groupNamed = (name: string) => store().groups.find((g) => g.name === name);

describe('duplicateGroup', () => {
  beforeEach(() => store().reset());

  it('copies the group and its waypoints', () => {
    const s = survey('Field');
    store().addSurveyGroup(s, [wp(0, -0.1), wp(1, -0.09)]);

    const id = store().duplicateGroup(s.id);

    expect(id).toBeTruthy();
    expect(id).not.toBe(s.id);
    expect(store().missionItems.filter((i) => i.groupId === id)).toHaveLength(2);
    expect(store().missionItems.filter((i) => i.groupId === s.id)).toHaveLength(2);
  });

  it('lands hidden and locked so it neither draws nor drifts', () => {
    const s = survey('Field');
    store().addSurveyGroup(s, [wp(0, -0.1)]);

    const id = store().duplicateGroup(s.id)!;

    const copy = store().groups.find((g) => g.id === id)!;
    expect(copy.visible).toBe(false);
    expect(copy.locked).toBe(true);
    expect(store().groups.find((g) => g.id === s.id)!.visible).toBe(true);
  });

  // The whole point of a backup: editing the original must not reach into it.
  it('deep-copies the polygon and config', () => {
    const s = survey('Field');
    store().addSurveyGroup(s, [wp(0, -0.1)]);
    const id = store().duplicateGroup(s.id)!;

    const original = store().groups.find((g) => g.id === s.id) as SurveyGroup;
    original.polygon[0]!.lat = 0;
    (original.config as { corridorBranches: Array<Array<{ lat: number }>> }).corridorBranches[0]![0]!.lat = 0;

    const copy = store().groups.find((g) => g.id === id) as SurveyGroup;
    expect(copy.polygon[0]!.lat).toBeCloseTo(51.5, 6);
    expect((copy.config as { corridorBranches: Array<Array<{ lat: number }>> }).corridorBranches[0]![0]!.lat)
      .toBeCloseTo(51.5, 6);
  });

  it('names copies so repeats do not collide', () => {
    const s = survey('Field');
    store().addSurveyGroup(s, [wp(0, -0.1)]);

    store().duplicateGroup(s.id);
    store().duplicateGroup(s.id);

    expect(groupNamed('Field backup')).toBeDefined();
    expect(groupNamed('Field backup 2')).toBeDefined();
  });

  it('keeps the sequence contiguous and appends the copy last', () => {
    const s = survey('Field');
    store().addSurveyGroup(s, [wp(0, -0.1), wp(1, -0.09)]);

    const id = store().duplicateGroup(s.id)!;

    expect(store().missionItems.map((i) => i.seq)).toEqual([0, 1, 2, 3]);
    expect(store().missionItems.slice(2).every((i) => i.groupId === id)).toBe(true);
  });

  it('returns null for a group that is not there', () => {
    expect(store().duplicateGroup('nope')).toBeNull();
  });
});
