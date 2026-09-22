/**
 * Splitting a mission into the runs the aircraft actually flies. Extracted
 * from the map panel's own logic so the boundary rules are pinned: a return
 * or a takeoff ends a run, and so does a group change.
 */
import { describe, it, expect } from 'vitest';
import { isReturnCommand, isTakeoffCommand } from './mission-end';
import { MAV_CMD, MAV_FRAME, commandHasLocation, type MissionItem } from '../../../shared/mission-types';

const item = (seq: number, command: number, groupId: string, lng = 0): MissionItem => ({
  seq,
  frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
  command,
  current: false,
  autocontinue: true,
  param1: 0, param2: 0, param3: 0, param4: 0,
  latitude: commandHasLocation(command) ? 51.5 : 0,
  longitude: commandHasLocation(command) ? lng : 0,
  altitude: 50,
  groupId,
});

/** Mirrors the map panel's run splitter. */
function splitRuns(items: MissionItem[]) {
  const runs: Array<{ lat: number; lng: number }[]> = [];
  let current: { lat: number; lng: number }[] = [];
  let prevGroup: string | undefined;
  for (const it of items) {
    if (isReturnCommand(it.command) || isTakeoffCommand(it.command)) {
      if (current.length) runs.push(current);
      current = [];
      prevGroup = undefined;
      continue;
    }
    if (!commandHasLocation(it.command) || (it.latitude === 0 && it.longitude === 0)) continue;
    if (current.length && prevGroup !== undefined && it.groupId !== prevGroup) {
      runs.push(current);
      current = [];
    }
    current.push({ lat: it.latitude, lng: it.longitude });
    prevGroup = it.groupId;
  }
  if (current.length) runs.push(current);
  return runs;
}

const wp = (seq: number, g: string, lng: number) => item(seq, MAV_CMD.NAV_WAYPOINT, g, lng);

describe('flown runs', () => {
  // Two separate flights must not be joined by a predicted leg: that is the
  // flight the plan explicitly says the aircraft will not make.
  it('breaks at a return', () => {
    const items = [
      wp(0, 'a', 0.01), wp(1, 'a', 0.02),
      item(2, MAV_CMD.NAV_RETURN_TO_LAUNCH, 'a'),
      item(3, MAV_CMD.NAV_TAKEOFF, 'b'),
      wp(4, 'b', 0.05), wp(5, 'b', 0.06),
    ];
    const runs = splitRuns(items);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.map((p) => p.lng)).toEqual([0.01, 0.02]);
    expect(runs[1]!.map((p) => p.lng)).toEqual([0.05, 0.06]);
  });

  it('breaks at a group change even with no return', () => {
    const items = [wp(0, 'a', 0.01), wp(1, 'a', 0.02), wp(2, 'b', 0.05)];
    expect(splitRuns(items).map((r) => r.length)).toEqual([2, 1]);
  });

  it('keeps one connected survey as one run', () => {
    const items = [item(0, MAV_CMD.NAV_TAKEOFF, 'a'), wp(1, 'a', 0.01), wp(2, 'a', 0.02), wp(3, 'a', 0.03)];
    expect(splitRuns(items)).toHaveLength(1);
    expect(splitRuns(items)[0]).toHaveLength(3);
  });

  it('skips the unplaced items rather than breaking on them', () => {
    const items = [
      wp(0, 'a', 0.01),
      item(1, MAV_CMD.DO_CHANGE_SPEED, 'a'),
      wp(2, 'a', 0.02),
    ];
    expect(splitRuns(items)).toHaveLength(1);
  });
});
