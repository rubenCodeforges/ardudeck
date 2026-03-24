import { describe, it, expect } from 'vitest';
import { createTakeoffWaypoint, MAV_FRAME, MAV_CMD } from './mission-types';

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

  it('sets yaw to NaN (keep current heading)', () => {
    const takeoff = createTakeoffWaypoint(0, 0, 0, 50, 15);
    expect(takeoff.param4).toBeNaN();
  });
});
