import { describe, it, expect } from 'vitest';
import {
  createDefaultWaypoint,
  createTakeoffWaypoint,
  ensureAutoMissionTakeoffPrefix,
  getAutoMissionResumeIndexAfterGuidedTakeoff,
  getMissionGuidedTakeoffAltitudeM,
  type MissionItem,
  MAV_FRAME,
  MAV_CMD,
} from './mission-types';

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

describe('ensureAutoMissionTakeoffPrefix', () => {
  it('prepends NAV_TAKEOFF for copter when first item is a waypoint', () => {
    const wp = createDefaultWaypoint(0, -35.36, 149.16, 25);
    const { mission, didPrepend } = ensureAutoMissionTakeoffPrefix([wp], 'copter');
    expect(didPrepend).toBe(true);
    expect(mission[0]!.command).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(mission[0]!.altitude).toBe(25);
    expect(mission[1]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
    expect(mission[1]!.seq).toBe(1);
  });

  it('does not prepend when takeoff is already first', () => {
    const t = createTakeoffWaypoint(0, 0, 0, 40);
    const wp = createDefaultWaypoint(1, -35.36, 149.16, 30);
    const { mission, didPrepend } = ensureAutoMissionTakeoffPrefix([t, wp], 'copter');
    expect(didPrepend).toBe(false);
    expect(mission[0]!.command).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(mission[0]!.seq).toBe(0);
    expect(mission[1]!.seq).toBe(1);
  });

  it('uses NAV_VTOL_TAKEOFF for vtol when prepending', () => {
    const wp = createDefaultWaypoint(0, 1, 2, 18);
    const { mission, didPrepend } = ensureAutoMissionTakeoffPrefix([wp], 'vtol');
    expect(didPrepend).toBe(true);
    expect(mission[0]!.command).toBe(MAV_CMD.NAV_VTOL_TAKEOFF);
    expect(mission[0]!.altitude).toBe(18);
  });

  it('leaves plane missions unchanged aside from seq', () => {
    const wp = createDefaultWaypoint(2, 1, 2, 100);
    const { mission, didPrepend } = ensureAutoMissionTakeoffPrefix([wp], 'plane');
    expect(didPrepend).toBe(false);
    expect(mission[0]!.seq).toBe(0);
    expect(mission[0]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
  });

  it('takeoff altitude follows first map waypoint, not NAV_LOITER_TO_ALT ceiling', () => {
    const loiterToAlt: MissionItem = {
      seq: 0,
      frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
      command: MAV_CMD.NAV_LOITER_TO_ALT,
      current: false,
      autocontinue: true,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      latitude: -35.36,
      longitude: 149.16,
      altitude: 80,
    };
    const wp = createDefaultWaypoint(1, -35.361, 149.161, 15);
    const { mission, didPrepend } = ensureAutoMissionTakeoffPrefix([loiterToAlt, wp], 'copter');
    expect(didPrepend).toBe(true);
    expect(mission[0]!.command).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(mission[0]!.altitude).toBe(15);
  });
});

describe('getMissionGuidedTakeoffAltitudeM / getAutoMissionResumeIndexAfterGuidedTakeoff', () => {
  it('uses first takeoff item altitude when present', () => {
    const t = createTakeoffWaypoint(0, 0, 0, 33);
    const wp = createDefaultWaypoint(1, 1, 2, 10);
    expect(getMissionGuidedTakeoffAltitudeM([t, wp])).toBe(33);
    expect(getAutoMissionResumeIndexAfterGuidedTakeoff([t, wp])).toBe(1);
  });

  it('uses route waypoint when no takeoff lead', () => {
    const wp = createDefaultWaypoint(0, -35, 149, 22);
    expect(getMissionGuidedTakeoffAltitudeM([wp])).toBe(22);
    expect(getAutoMissionResumeIndexAfterGuidedTakeoff([wp])).toBe(0);
  });

  it('single takeoff item resumes at 0', () => {
    const t = createTakeoffWaypoint(0, 0, 0, 40);
    expect(getAutoMissionResumeIndexAfterGuidedTakeoff([t])).toBe(0);
  });
});
