import { describe, it, expect, beforeEach } from 'vitest';
import { useMissionStore } from './mission-store';
import { createSurveyGroup } from '../../shared/mission-group-types';
import type { MissionItem } from '../../shared/mission-types';
import { MAV_CMD, MAV_FRAME } from '../../shared/mission-types';

const poly = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.51, lng: -0.1 },
  { lat: 51.51, lng: -0.09 },
];

function wp(lon: number): MissionItem {
  return {
    seq: 0,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.NAV_WAYPOINT,
    current: false,
    autocontinue: true,
    param1: 0, param2: 0, param3: 0, param4: 0,
    latitude: 51.5,
    longitude: lon,
    altitude: 50,
  };
}

const survey = (name: string) =>
  createSurveyGroup({ name, generatorId: 'builtin.grid', generatorVersion: '1.0.0', polygon: poly, config: { altitude: 50 } });

/** Group name of each waypoint, in the order they would be flown. */
function flownOrder(): string[] {
  const { missionItems, groups } = useMissionStore.getState();
  return [...missionItems]
    .sort((a, b) => a.seq - b.seq)
    .map((it) => groups.find((g) => g.id === it.groupId)?.name ?? '?');
}


const withFinish = (name: string) =>
  createSurveyGroup({
    name,
    generatorId: 'builtin.grid',
    generatorVersion: '1.0.0',
    polygon: poly,
    config: { altitude: 50, finish: 'rtl' },
  });

const rtl = (): MissionItem => ({
  seq: 0,
  frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
  command: MAV_CMD.NAV_RETURN_TO_LAUNCH,
  current: false,
  autocontinue: true,
  param1: 0, param2: 0, param3: 0, param4: 0,
  latitude: 0, longitude: 0, altitude: 0,
});

describe('group order', () => {
  beforeEach(() => {
    const store = useMissionStore.getState();
    store.reset();
    store.addSurveyGroup(survey('A'), [wp(-0.10), wp(-0.11)]);
    store.addSurveyGroup(survey('B'), [wp(-0.20), wp(-0.21)]);
    store.addSurveyGroup(survey('C'), [wp(-0.30), wp(-0.31)]);
  });

  it('flies the groups in the order they were added', () => {
    expect(flownOrder()).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
  });

  // The pilot's complaint: no way to say survey B comes first.
  it('moves a group earlier, waypoints and all', () => {
    const b = useMissionStore.getState().groups.find((g) => g.name === 'B')!;
    useMissionStore.getState().moveGroup(b.id, 'up');
    expect(flownOrder()).toEqual(['B', 'B', 'A', 'A', 'C', 'C']);
  });

  it('moves a group later', () => {
    const a = useMissionStore.getState().groups.find((g) => g.name === 'A')!;
    useMissionStore.getState().moveGroup(a.id, 'down');
    expect(flownOrder()).toEqual(['B', 'B', 'A', 'A', 'C', 'C']);
  });

  // Reordering only the group's `order` left the table and the map on the old
  // sequence while the upload used the new one.
  it('keeps the seq numbers contiguous and matching the upload', () => {
    const c = useMissionStore.getState().groups.find((g) => g.name === 'C')!;
    useMissionStore.getState().moveGroup(c.id, 'up');
    const seqs = useMissionStore.getState().missionItems.map((i) => i.seq);
    expect(seqs).toEqual([0, 1, 2, 3, 4, 5]);
    const uploadLons = useMissionStore.getState().getUploadItems().map((i) => i.longitude);
    const tableLons = [...useMissionStore.getState().missionItems]
      .sort((a, b) => a.seq - b.seq)
      .map((i) => i.longitude);
    expect(uploadLons).toEqual(tableLons);
  });

  it('does nothing at the ends', () => {
    const { groups, moveGroup } = useMissionStore.getState();
    const first = groups.find((g) => g.name === 'A')!;
    const lastGroup = groups.find((g) => g.name === 'C')!;
    moveGroup(first.id, 'up');
    moveGroup(lastGroup.id, 'down');
    expect(flownOrder()).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
  });
});

describe('connect surveys', () => {
  const returns = () =>
    useMissionStore.getState().missionItems.filter((i) => i.command === MAV_CMD.NAV_RETURN_TO_LAUNCH);

  beforeEach(() => {
    const store = useMissionStore.getState();
    store.reset();
    store.addSurveyGroup(withFinish('A'), [wp(-0.10), wp(-0.11), rtl()]);
    store.addSurveyGroup(withFinish('B'), [wp(-0.20), wp(-0.21), rtl()]);
  });

  // Inserting a survey changes nothing by itself: the pilot is warned and
  // presses the button, so nothing they cannot see is deleted.
  it('leaves both returns in place until asked', () => {
    expect(returns()).toHaveLength(2);
    expect(flownOrder()).toEqual(['A', 'A', 'A', 'B', 'B', 'B']);
  });

  it('drops the middle return on the button, keeping the last', () => {
    useMissionStore.getState().connectSurveys();
    expect(returns()).toHaveLength(1);
    const items = [...useMissionStore.getState().missionItems].sort((a, b) => a.seq - b.seq);
    expect(items[items.length - 1]!.command).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
    expect(flownOrder()).toEqual(['A', 'A', 'B', 'B', 'B']);
    expect(items.map((i) => i.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it('is a no-op once connected', () => {
    const store = useMissionStore.getState();
    store.connectSurveys();
    const after = useMissionStore.getState().missionItems;
    store.connectSurveys();
    expect(useMissionStore.getState().missionItems).toBe(after);
  });
});

describe('connecting a chosen set, in a chosen order', () => {
  const returns = () =>
    useMissionStore.getState().missionItems.filter((i) => i.command === MAV_CMD.NAV_RETURN_TO_LAUNCH);

  beforeEach(() => {
    const store = useMissionStore.getState();
    store.reset();
    store.addSurveyGroup(withFinish('A'), [wp(-0.10), wp(-0.11), rtl()]);
    store.addSurveyGroup(withFinish('B'), [wp(-0.20), wp(-0.21), rtl()]);
    store.addSurveyGroup(withFinish('C'), [wp(-0.30), wp(-0.31), rtl()]);
  });

  const idOf = (name: string) => useMissionStore.getState().groups.find((g) => g.name === name)!.id;

  // The pilot ticks C then A: those two fly as one, in that order, and B is
  // left completely alone.
  it('connects only the picked surveys, in the ticked order', () => {
    useMissionStore.getState().connectSurveys([idOf('C'), idOf('A')]);
    expect(flownOrder()).toEqual(['C', 'C', 'A', 'A', 'A', 'B', 'B', 'B']);
    expect(returns()).toHaveLength(2);
  });

  it('leaves the untouched survey with its own return', () => {
    useMissionStore.getState().connectSurveys([idOf('C'), idOf('A')]);
    const b = idOf('B');
    const ofB = useMissionStore.getState().missionItems.filter((i) => i.groupId === b);
    expect(ofB.at(-1)!.command).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
  });

  it('with no pick it still joins everything', () => {
    useMissionStore.getState().connectSurveys();
    expect(returns()).toHaveLength(1);
    expect(flownOrder()).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'C']);
  });

  it('keeps the sequence contiguous after a reordering connect', () => {
    useMissionStore.getState().connectSurveys([idOf('C'), idOf('A')]);
    const items = useMissionStore.getState().missionItems;
    expect(items.map((i) => i.seq)).toEqual(items.map((_, i) => i));
  });
});
