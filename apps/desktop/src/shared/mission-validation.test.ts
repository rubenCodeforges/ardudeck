import { describe, it, expect } from 'vitest';
import { validateMission } from './mission-validation';
import { MAV_CMD, MAV_FRAME, type MissionItem } from './mission-types';
import { createManualGroup, createSurveyGroup } from './mission-group-types';

function wp(seq: number, over: Partial<MissionItem> = {}): MissionItem {
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
    longitude: -0.1,
    altitude: 80,
    groupId: 'g1',
    ...over,
  };
}

const G1 = { ...createManualGroup({ name: 'A' }), id: 'g1' };

describe('validateMission', () => {
  it('passes a clean mission with a takeoff', () => {
    const items = [
      wp(0, { command: MAV_CMD.NAV_TAKEOFF, latitude: 0, longitude: 0 }),
      wp(1),
      wp(2),
    ];
    const res = validateMission(items, [G1], { isAir: true });
    expect(res.errorCount).toBe(0);
    expect(res.warnCount).toBe(0);
  });

  it('errors when over the FC ceiling', () => {
    const items = Array.from({ length: 6 }, (_, i) => wp(i));
    const res = validateMission(items, [G1], { ceiling: 5 });
    expect(res.checks.some((c) => c.id === 'ceiling' && c.severity === 'error')).toBe(true);
    expect(res.errorCount).toBeGreaterThan(0);
  });

  it('warns about an empty group', () => {
    const empty = { ...createSurveyGroup({ name: 'Empty', generatorId: 'g', generatorVersion: '1', polygon: [], config: {} }), id: 'g2' };
    const res = validateMission([wp(0)], [G1, empty]);
    expect(res.checks.some((c) => c.id.startsWith('empty-group'))).toBe(true);
  });

  it('errors on a DO_JUMP to a missing target', () => {
    const items = [wp(0), wp(1, { command: MAV_CMD.DO_JUMP, param1: 99, latitude: 0, longitude: 0 })];
    const res = validateMission(items, [G1]);
    expect(res.checks.some((c) => c.id === 'do-jump' && c.severity === 'error')).toBe(true);
  });

  it('warns on a missing takeoff for an air mission', () => {
    const res = validateMission([wp(0), wp(1)], [G1], { isAir: true });
    expect(res.checks.some((c) => c.id === 'no-takeoff')).toBe(true);
  });

  it('warns on non-positive and too-high altitudes', () => {
    const items = [wp(0, { altitude: 0 }), wp(1, { altitude: 9000 })];
    const res = validateMission(items, [G1], { maxAltitude: 500 });
    expect(res.checks.some((c) => c.id === 'alt-nonpositive')).toBe(true);
    expect(res.checks.some((c) => c.id === 'alt-high')).toBe(true);
  });

  it('formats altitude warnings with the selected display unit', () => {
    const items = [wp(0, { altitude: 9000 })];
    const res = validateMission(items, [G1], { maxAltitude: 500, altitudeUnit: 'ft' });
    expect(res.checks.find((c) => c.id === 'alt-high')?.message).toContain('1640 ft');
  });
});
