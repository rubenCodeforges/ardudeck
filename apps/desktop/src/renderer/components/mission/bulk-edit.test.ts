import { describe, it, expect } from 'vitest';
import type { MissionItem } from '../../../shared/mission-types';
import { MAV_CMD, MAV_FRAME } from '../../../shared/mission-types';
import { bulkSetAltitude, bulkSetSpeed, selectionTouchesGroups, setWaypointHeading, waypointHeading } from './bulk-edit';

function item(seq: number, command: number, overrides: Partial<MissionItem> = {}): MissionItem {
  return {
    seq,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command,
    current: false,
    autocontinue: true,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    latitude: 53 + seq * 0.001,
    longitude: 8 + seq * 0.001,
    altitude: 30,
    groupId: 'g1',
    ...overrides,
  };
}

describe('bulkSetAltitude', () => {
  it('sets altitude on selected location commands only', () => {
    const items = [
      item(0, MAV_CMD.NAV_WAYPOINT),
      item(1, MAV_CMD.DO_CHANGE_SPEED, { param2: 5 }),
      item(2, MAV_CMD.NAV_WAYPOINT),
    ];
    const { items: next, changed } = bulkSetAltitude(items, new Set([0, 1, 2]), 50);
    expect(changed).toBe(2);
    expect(next[0]!.altitude).toBe(50);
    expect(next[1]!.altitude).toBe(30);
    expect(next[2]!.altitude).toBe(50);
  });

  it('leaves unselected items untouched', () => {
    const items = [item(0, MAV_CMD.NAV_WAYPOINT), item(1, MAV_CMD.NAV_WAYPOINT)];
    const { items: next, changed } = bulkSetAltitude(items, new Set([1]), 80);
    expect(changed).toBe(1);
    expect(next[0]!.altitude).toBe(30);
    expect(next[1]!.altitude).toBe(80);
  });

  it('does not touch altitude frames', () => {
    const items = [item(0, MAV_CMD.NAV_WAYPOINT, { frame: MAV_FRAME.GLOBAL_TERRAIN_ALT })];
    const { items: next } = bulkSetAltitude(items, new Set([0]), 42);
    expect(next[0]!.frame).toBe(items[0]!.frame);
  });

  it('returns the same array reference when nothing changes', () => {
    const items = [item(0, MAV_CMD.NAV_WAYPOINT, { altitude: 50 })];
    const { items: next, changed } = bulkSetAltitude(items, new Set([0]), 50);
    expect(changed).toBe(0);
    expect(next).toBe(items);
  });
});

describe('bulkSetSpeed', () => {
  it('inserts a DO_CHANGE_SPEED before the first selected item', () => {
    const items = [
      item(0, MAV_CMD.NAV_TAKEOFF),
      item(1, MAV_CMD.NAV_WAYPOINT),
      item(2, MAV_CMD.NAV_WAYPOINT),
    ];
    const { items: next, changed } = bulkSetSpeed(items, new Set([1, 2]), 8);
    expect(changed).toBe(1);
    expect(next).toHaveLength(4);
    expect(next[1]!.command).toBe(MAV_CMD.DO_CHANGE_SPEED);
    expect(next[1]!.param2).toBe(8);
    expect(next[1]!.param1).toBe(1);
    expect(next[1]!.param3).toBe(-1);
    expect(next[1]!.groupId).toBe('g1');
    expect(next.map((it) => it.seq)).toEqual([0, 1, 2, 3]);
  });

  it('updates existing selected DO_CHANGE_SPEED instead of inserting', () => {
    const items = [
      item(0, MAV_CMD.DO_CHANGE_SPEED, { param2: 5 }),
      item(1, MAV_CMD.NAV_WAYPOINT),
    ];
    const { items: next, changed } = bulkSetSpeed(items, new Set([0, 1]), 12);
    expect(changed).toBe(1);
    expect(next).toHaveLength(2);
    expect(next[0]!.param2).toBe(12);
  });

  it('zero clears: removes selected DO_CHANGE_SPEED items and renumbers', () => {
    const items = [
      item(0, MAV_CMD.DO_CHANGE_SPEED, { param2: 5 }),
      item(1, MAV_CMD.NAV_WAYPOINT),
      item(2, MAV_CMD.DO_CHANGE_SPEED, { param2: 7 }),
      item(3, MAV_CMD.NAV_WAYPOINT),
    ];
    const { items: next, changed } = bulkSetSpeed(items, new Set([0, 1, 2, 3]), 0);
    expect(changed).toBe(2);
    expect(next).toHaveLength(2);
    expect(next.every((it) => it.command !== MAV_CMD.DO_CHANGE_SPEED)).toBe(true);
    expect(next.map((it) => it.seq)).toEqual([0, 1]);
  });

  it('zero on a selection without speed items is a no-op', () => {
    const items = [item(0, MAV_CMD.NAV_WAYPOINT)];
    const { items: next, changed } = bulkSetSpeed(items, new Set([0]), 0);
    expect(changed).toBe(0);
    expect(next).toBe(items);
  });

  it('same speed on an existing selected speed item is a no-op', () => {
    const items = [item(0, MAV_CMD.DO_CHANGE_SPEED, { param2: 9 }), item(1, MAV_CMD.NAV_WAYPOINT)];
    const { items: next, changed } = bulkSetSpeed(items, new Set([0]), 9);
    expect(changed).toBe(0);
    expect(next).toBe(items);
  });

  it('empty selection is a no-op', () => {
    const items = [item(0, MAV_CMD.NAV_WAYPOINT)];
    const { changed } = bulkSetSpeed(items, new Set(), 10);
    expect(changed).toBe(0);
  });
});

describe('selectionTouchesGroups', () => {
  it('detects selected items inside survey groups', () => {
    const items = [item(0, MAV_CMD.NAV_WAYPOINT, { groupId: 'survey-1' }), item(1, MAV_CMD.NAV_WAYPOINT)];
    expect(selectionTouchesGroups(items, new Set([0]), new Set(['survey-1']))).toBe(true);
    expect(selectionTouchesGroups(items, new Set([1]), new Set(['survey-1']))).toBe(false);
  });

  it('false when selection avoids survey groups', () => {
    const items = [
      item(0, MAV_CMD.NAV_WAYPOINT, { groupId: 'manual' }),
      item(1, MAV_CMD.NAV_WAYPOINT, { groupId: 'survey-1' }),
    ];
    expect(selectionTouchesGroups(items, new Set([0]), new Set(['survey-1']))).toBe(false);
  });
});

describe('setWaypointHeading', () => {
  const mission = () => [item(0, MAV_CMD.NAV_WAYPOINT), item(1, MAV_CMD.NAV_WAYPOINT), item(2, MAV_CMD.NAV_WAYPOINT)];

  it('inserts an absolute CONDITION_YAW right after the waypoint', () => {
    const r = setWaypointHeading(mission(), 1, 90);
    expect(r.changed).toBe(1);
    expect(r.items.map((i) => i.command)).toEqual([MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_WAYPOINT, MAV_CMD.CONDITION_YAW, MAV_CMD.NAV_WAYPOINT]);
    expect(r.items[2]).toMatchObject({ seq: 2, param1: 90, param2: 0, param3: 0, param4: 0, groupId: 'g1' });
    expect(r.items[3]!.seq).toBe(3);
    expect(waypointHeading(r.items, 1)).toBe(90);
  });

  it('updates an existing heading instead of adding another', () => {
    const once = setWaypointHeading(mission(), 1, 90).items;
    const r = setWaypointHeading(once, 1, 400);
    expect(r.items).toHaveLength(4);
    expect(waypointHeading(r.items, 1)).toBe(40);
  });

  it('removes it with null and leaves relative yaw commands alone', () => {
    const once = setWaypointHeading(mission(), 0, 180).items;
    const r = setWaypointHeading(once, 0, null);
    expect(r.items.map((i) => i.command)).toEqual([MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_WAYPOINT, MAV_CMD.NAV_WAYPOINT]);
    const relative = [item(0, MAV_CMD.NAV_WAYPOINT), item(1, MAV_CMD.CONDITION_YAW, { param1: 30, param4: 1 })];
    expect(waypointHeading(relative, 0)).toBeNull();
    expect(setWaypointHeading(relative, 0, null).changed).toBe(0);
  });
});
