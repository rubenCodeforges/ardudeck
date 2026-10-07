import { describe, it, expect } from 'vitest';
import { getFlightModeName, encodePx4CustomMode } from './modes.js';

describe('getFlightModeName', () => {
  it('uses the copter table for multirotor MAV_TYPEs', () => {
    expect(getFlightModeName(3, 2, 5)).toBe('Loiter');
    expect(getFlightModeName(3, 14, 6)).toBe('RTL');
  });

  it('uses the plane table for fixed wing and VTOL', () => {
    expect(getFlightModeName(3, 1, 10)).toBe('Auto');
    expect(getFlightModeName(3, 20, 10)).toBe('Auto');
  });

  it('uses the rover table for rovers and boats', () => {
    expect(getFlightModeName(3, 10, 4)).toBe('Hold');
    expect(getFlightModeName(3, 11, 4)).toBe('Hold');
  });

  it('decodes PX4 by autopilot regardless of MAV_TYPE', () => {
    expect(getFlightModeName(12, 2, encodePx4CustomMode(4, 4))).toBe('Mission');
  });

  it('falls back to the raw mode number', () => {
    expect(getFlightModeName(3, 2, 99)).toBe('Mode 99');
    expect(getFlightModeName(3, 6, 1)).toBe('Mode 1');
  });
});
