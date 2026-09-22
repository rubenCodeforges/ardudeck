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

const wp = (lng: number): MissionItem => ({
  seq: 0,
  frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
  command: MAV_CMD.NAV_WAYPOINT,
  current: false,
  autocontinue: true,
  param1: 0, param2: 0, param3: 0, param4: 0,
  latitude: 51.5,
  longitude: lng,
  altitude: 50,
});

const survey = (name: string) =>
  createSurveyGroup({ name, generatorId: 'builtin.grid', generatorVersion: '1.0.0', polygon: poly, config: { altitude: 50 } });

const order = () => {
  const { missionItems, groups } = useMissionStore.getState();
  return [...missionItems]
    .sort((a, b) => a.seq - b.seq)
    .map((it) => groups.find((g) => g.id === it.groupId)?.name ?? '?');
};

describe('regenerating a survey keeps its place', () => {
  beforeEach(() => {
    const s = useMissionStore.getState();
    s.reset();
    s.addSurveyGroup(survey('A'), [wp(-0.10), wp(-0.11)]);
    s.addSurveyGroup(survey('B'), [wp(-0.20), wp(-0.21)]);
    s.addSurveyGroup(survey('C'), [wp(-0.30), wp(-0.31)]);
  });

  // The bug behind the swapping surveys: editing A moved it after C.
  it('does not move the edited survey to the end', () => {
    const a = useMissionStore.getState().groups.find((g) => g.name === 'A')!;
    useMissionStore.getState().syncSurveyGroupFromDraft(
      a.id, poly, { altitude: 50 }, [wp(-0.12), wp(-0.13), wp(-0.14)], 'sig',
    );
    expect(order()).toEqual(['A', 'A', 'A', 'B', 'B', 'C', 'C']);
  });

  // Every consumer sorts, or does not, so a gap or a stale seq shows up as a
  // different order in the list, the labels and the upload.
  it('leaves the sequence contiguous and the array in seq order', () => {
    const b = useMissionStore.getState().groups.find((g) => g.name === 'B')!;
    useMissionStore.getState().syncSurveyGroupFromDraft(
      b.id, poly, { altitude: 50 }, [wp(-0.22)], 'sig',
    );
    const items = useMissionStore.getState().missionItems;
    expect(items.map((i) => i.seq)).toEqual(items.map((_, i) => i));
    expect(order()).toEqual(['A', 'A', 'B', 'C', 'C']);
  });

  it('keeps the upload list matching the table', () => {
    const c = useMissionStore.getState().groups.find((g) => g.name === 'C')!;
    useMissionStore.getState().syncSurveyGroupFromDraft(
      c.id, poly, { altitude: 50 }, [wp(-0.32), wp(-0.33)], 'sig',
    );
    const table = [...useMissionStore.getState().missionItems]
      .sort((a, b) => a.seq - b.seq).map((i) => i.longitude);
    expect(useMissionStore.getState().getUploadItems().map((i) => i.longitude)).toEqual(table);
  });
});

describe('interleaved groups', () => {
  /** Exactly the live corruption: two surveys alternating waypoint by waypoint. */
  function interleave() {
    const s = useMissionStore.getState();
    s.reset();
    s.addSurveyGroup(survey('A'), [wp(-0.10), wp(-0.11), wp(-0.12)]);
    s.addSurveyGroup(survey('B'), [wp(-0.20), wp(-0.21), wp(-0.22)]);
    const { missionItems, groups } = useMissionStore.getState();
    const a = groups.find((g) => g.name === 'A')!.id;
    const b = groups.find((g) => g.name === 'B')!.id;
    const of = (id: string) => missionItems.filter((i) => i.groupId === id);
    const mixed = [of(a)[0]!, of(b)[0]!, of(a)[1]!, of(b)[1]!, of(a)[2]!, of(b)[2]!]
      .map((it, i) => ({ ...it, seq: i }));
    useMissionStore.setState({ missionItems: mixed });
    return { a, b };
  }

  it('is what the repair puts right', () => {
    interleave();
    expect(order()).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
    useMissionStore.getState().regroupItems();
    expect(order()).toEqual(['A', 'A', 'A', 'B', 'B', 'B']);
    const items = useMissionStore.getState().missionItems;
    expect(items.map((i) => i.seq)).toEqual(items.map((_, i) => i));
  });

  it('keeps each group’s own waypoint order', () => {
    const { a } = interleave();
    useMissionStore.getState().regroupItems();
    const lngs = useMissionStore.getState().missionItems
      .filter((i) => i.groupId === a).map((i) => i.longitude);
    expect(lngs).toEqual([-0.10, -0.11, -0.12]);
  });

  it('leaves an already tidy plan untouched', () => {
    const before = useMissionStore.getState().missionItems;
    useMissionStore.getState().regroupItems();
    expect(useMissionStore.getState().missionItems).toBe(before);
  });

  // Connect has to repair the order first, or it hangs the returns off the
  // wrong item. It adds no return here: this plan has none to move.
  it('connect untangles before it decides where the returns go', () => {
    interleave();
    useMissionStore.getState().connectSurveys();
    expect(order()).toEqual(['A', 'A', 'A', 'B', 'B', 'B']);
  });
});
