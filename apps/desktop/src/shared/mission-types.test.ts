import { describe, it, expect } from 'vitest';
import { createTakeoffWaypoint, calculateMissionDistance, MAV_FRAME, MAV_CMD } from './mission-types';
import type { MissionItem } from './mission-types';

describe('createTakeoffWaypoint', () => {
  it('always sets latitude and longitude to 0 regardless of input', () => {
    const takeoff = createTakeoffWaypoint(0, -35.362, 149.165, 50, 15);
    expect(takeoff.latitude).toBe(0);
    expect(takeoff.longitude).toBe(0);
  });

  it('ignores lat/lon even with non-zero values', () => {
    const takeoff = createTakeoffWaypoint(1, 51.5074, -0.1278, 100, 10);
    expect(takeoff.latitude).toBe(0);
    expect(takeoff.longitude).toBe(0);
  });

  it('preserves target altitude', () => {
    const takeoff = createTakeoffWaypoint(0, 0, 0, 80);
    expect(takeoff.altitude).toBe(80);
  });

  it('uses default altitude of 50m when not specified', () => {
    const takeoff = createTakeoffWaypoint(0, 0, 0);
    expect(takeoff.altitude).toBe(50);
  });

  it('uses default pitch of 15 degrees when not specified', () => {
    const takeoff = createTakeoffWaypoint(0, 0, 0, 50);
    expect(takeoff.param1).toBe(15);
  });

  it('allows custom pitch', () => {
    const takeoff = createTakeoffWaypoint(0, 0, 0, 50, 20);
    expect(takeoff.param1).toBe(20);
  });

  it('uses GLOBAL_RELATIVE_ALT frame', () => {
    const takeoff = createTakeoffWaypoint(0, 0, 0, 50, 15);
    expect(takeoff.frame).toBe(MAV_FRAME.GLOBAL_RELATIVE_ALT);
  });

  it('uses NAV_TAKEOFF command', () => {
    const takeoff = createTakeoffWaypoint(0, 0, 0, 50, 15);
    expect(takeoff.command).toBe(MAV_CMD.NAV_TAKEOFF);
  });

  it('sets correct seq number', () => {
    const takeoff = createTakeoffWaypoint(5, 0, 0, 50, 15);
    expect(takeoff.seq).toBe(5);
  });

  it('sets yaw to 0 (keep current heading)', () => {
    const takeoff = createTakeoffWaypoint(0, 0, 0, 50, 15);
    expect(takeoff.param4).toBe(0);
  });
});

describe('calculateMissionDistance', () => {
  const at = (seq: number, lng: number): MissionItem => ({
    seq,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.NAV_WAYPOINT,
    current: false,
    autocontinue: true,
    param1: 0, param2: 0, param3: 0, param4: 0,
    latitude: 0,
    longitude: lng,
    altitude: 50,
  });

  // 0.01 deg of longitude at the equator, three times over.
  const straight = [at(0, 0.01), at(1, 0.02), at(2, 0.03), at(3, 0.04)];

  it('measures the flown sequence', () => {
    expect(calculateMissionDistance(straight)).toBeCloseTo(3 * 1113.2, -1);
  });

  // The mission is the seq order. An array left shuffled by an edit used to
  // zig-zag the whole route and report a total many times the real one.
  it('is unaffected by the array order', () => {
    const shuffled = [straight[2]!, straight[0]!, straight[3]!, straight[1]!];
    expect(calculateMissionDistance(shuffled)).toBeCloseTo(calculateMissionDistance(straight), 6);
  });

  it('skips the unplaced items', () => {
    const withTakeoff = [createTakeoffWaypoint(0, 0, 0, 50), ...straight.map((w) => ({ ...w, seq: w.seq + 1 }))];
    expect(calculateMissionDistance(withTakeoff)).toBeCloseTo(calculateMissionDistance(straight), 6);
  });
});
