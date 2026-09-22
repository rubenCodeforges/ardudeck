/**
 * Whether the map draws a leg between two groups. Connected surveys are flown
 * one into the next, so that leg is real; two separate flights are not joined.
 */
import { describe, it, expect } from 'vitest';
import { MAV_CMD, MAV_FRAME, isNavigationCommand, commandHasLocation, hasValidCoordinates, type MissionItem } from '../../../shared/mission-types';

const item = (seq: number, command: number, groupId: string, lng = 0): MissionItem => ({
  seq,
  frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
  command,
  current: false,
  autocontinue: true,
  param1: 0, param2: 0, param3: 0, param4: 0,
  // Takeoff and return items carry no position in a real mission.
  latitude: command === MAV_CMD.NAV_WAYPOINT ? 51.5 : 0,
  longitude: command === MAV_CMD.NAV_WAYPOINT ? lng : 0,
  altitude: 50,
  groupId,
});

/** Mirrors the map panel's leg rule. */
function legs(items: MissionItem[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prev: MissionItem | null = null;
  let broke = false;
  for (const it of items) {
    const located = isNavigationCommand(it.command)
      && commandHasLocation(it.command)
      && hasValidCoordinates(it.latitude, it.longitude);
    if (located) {
      if (prev && !broke) out.push([prev.longitude, it.longitude]);
      prev = it;
      broke = false;
      continue;
    }
    if (it.command === MAV_CMD.NAV_RETURN_TO_LAUNCH
      || it.command === MAV_CMD.NAV_LAND
      || it.command === MAV_CMD.NAV_VTOL_LAND
      || it.command === MAV_CMD.NAV_TAKEOFF
      || it.command === MAV_CMD.NAV_VTOL_TAKEOFF) {
      broke = true;
    }
  }
  return out;
}

const wp = (seq: number, g: string, lng: number) => item(seq, MAV_CMD.NAV_WAYPOINT, g, lng);

describe('legs between groups', () => {
  // Connected: the aircraft really does fly from A's last WP to B's first.
  it('draws the transit when two surveys share a flight', () => {
    const items = [wp(0, 'a', 0.01), wp(1, 'a', 0.02), wp(2, 'b', 0.05), wp(3, 'b', 0.06)];
    expect(legs(items)).toContainEqual([0.02, 0.05]);
  });

  it('does not draw it across a return', () => {
    const items = [
      wp(0, 'a', 0.01), wp(1, 'a', 0.02),
      item(2, MAV_CMD.NAV_RETURN_TO_LAUNCH, 'a'),
      item(3, MAV_CMD.NAV_TAKEOFF, 'b'),
      wp(4, 'b', 0.05), wp(5, 'b', 0.06),
    ];
    expect(legs(items)).not.toContainEqual([0.02, 0.05]);
    expect(legs(items)).toEqual([[0.01, 0.02], [0.05, 0.06]]);
  });

  it('does not draw it across a bare takeoff either', () => {
    const items = [wp(0, 'a', 0.01), item(1, MAV_CMD.NAV_TAKEOFF, 'b'), wp(2, 'b', 0.05)];
    expect(legs(items)).toEqual([]);
  });

  it('is unaffected by DO_ commands in between', () => {
    const items = [wp(0, 'a', 0.01), item(1, MAV_CMD.DO_CHANGE_SPEED, 'a'), wp(2, 'b', 0.05)];
    expect(legs(items)).toEqual([[0.01, 0.05]]);
  });
});
