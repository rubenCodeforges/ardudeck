import { describe, it, expect, beforeEach } from 'vitest';
import { useMissionStore } from './mission-store';
import { createSurveyGroup } from '../../shared/mission-group-types';
import type { MissionItem } from '../../shared/mission-types';
import { MAV_CMD, MAV_FRAME } from '../../shared/mission-types';

function wp(seq: number, lon: number): MissionItem {
  return {
    seq,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.NAV_WAYPOINT,
    current: false,
    autocontinue: true,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    latitude: 51.5,
    longitude: lon,
    altitude: 50,
  };
}

const poly = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.51, lng: -0.1 },
  { lat: 51.51, lng: -0.09 },
];

const survey = (name: string) =>
  createSurveyGroup({ name, generatorId: 'builtin.grid', generatorVersion: '1.0.0', polygon: poly, config: { altitude: 50 } });

const groupOf = (seq: number) => useMissionStore.getState().missionItems.find((i) => i.seq === seq)?.groupId;

describe('insertWaypoint group placement', () => {
  beforeEach(() => {
    useMissionStore.getState().reset();
  });

  // The flown path has to run through the new waypoint. Parking it in its own
  // group elsewhere in the sequence makes the vehicle detour out and back.
  it('joins the run it lands inside, survey included', () => {
    const s = survey('Field');
    useMissionStore.getState().addSurveyGroup(s, [wp(0, -0.1), wp(1, -0.09), wp(2, -0.08)]);

    useMissionStore.getState().insertWaypoint(0, 51.5, -0.095, 50);

    expect(groupOf(1)).toBe(s.id);
    expect(useMissionStore.getState().missionItems.map((i) => i.seq)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the group in one contiguous run, so the list shows one header', () => {
    const s = survey('Field');
    useMissionStore.getState().addSurveyGroup(s, [wp(0, -0.1), wp(1, -0.09), wp(2, -0.08)]);

    useMissionStore.getState().insertWaypoint(1, 51.5, -0.085, 50);

    const ids = useMissionStore.getState().missionItems.map((i) => i.groupId);
    const runs = ids.filter((id, i) => i === 0 || id !== ids[i - 1]);
    expect(runs).toEqual([s.id]);
  });

  it('joins a manual run it lands inside', () => {
    useMissionStore.getState().insertWaypoint(-1, 51.5, -0.1, 50);
    useMissionStore.getState().insertWaypoint(0, 51.5, -0.09, 50);
    const host = groupOf(0);

    useMissionStore.getState().insertWaypoint(0, 51.5, -0.095, 50);

    expect(groupOf(1)).toBe(host);
  });

  it('ignores a group id that no longer exists', () => {
    const s = survey('Field');
    useMissionStore.getState().addSurveyGroup(s, [wp(0, -0.1), wp(1, -0.09)]);

    useMissionStore.getState().insertWaypoint(0, 51.5, -0.095, 50, 'deleted-group');

    const placed = groupOf(1);
    expect(placed).toBeDefined();
    expect(placed).not.toBe('deleted-group');
  });
});
