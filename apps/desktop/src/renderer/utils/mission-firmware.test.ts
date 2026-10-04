import { describe, it, expect } from 'vitest';
import { detectMissionFirmware, effectiveMissionFirmware } from './mission-firmware';

describe('detectMissionFirmware', () => {
  it('returns null when nothing is connected, so the toggle decides', () => {
    expect(detectMissionFirmware({ isConnected: false })).toBeNull();
    expect(detectMissionFirmware({})).toBeNull();
  });

  it('detects PX4 from the heartbeat rather than lumping it in with ArduPilot', () => {
    expect(detectMissionFirmware({ isConnected: true, protocol: 'mavlink', firmware: 'px4' })).toBe('px4');
  });

  it('detects ArduPilot', () => {
    expect(detectMissionFirmware({ isConnected: true, protocol: 'mavlink', firmware: 'ardupilot' })).toBe('ardupilot');
  });

  it('detects iNav over MSP', () => {
    expect(detectMissionFirmware({ isConnected: true, protocol: 'msp', fcVariant: 'INAV' })).toBe('inav');
  });

  it('leaves an unidentified MAVLink vehicle (INAV over MAVLink, Vehicle SDK) to the toggle', () => {
    // Deliberate: an unknown stack still speaks the common mission set, and
    // ArduPilot's palette is the superset. Documented rather than accidental.
    expect(detectMissionFirmware({ isConnected: true, protocol: 'mavlink' })).toBe('ardupilot');
    expect(detectMissionFirmware({ isConnected: true, protocol: 'mavlink', firmware: 'custom' })).toBeNull();
  });

  it('does not treat a Betaflight MSP link as iNav', () => {
    expect(detectMissionFirmware({ isConnected: true, protocol: 'msp', fcVariant: 'BTFL' })).toBe('ardupilot');
  });
});

describe('effectiveMissionFirmware', () => {
  it('lets the live link win over the offline setting', () => {
    expect(effectiveMissionFirmware({ isConnected: true, firmware: 'px4' }, 'ardupilot')).toBe('px4');
    expect(effectiveMissionFirmware({ isConnected: true, firmware: 'ardupilot' }, 'px4')).toBe('ardupilot');
  });

  it('uses the offline setting when disconnected, including PX4', () => {
    // The gap this closes: PX4 was not expressible offline, so planning a PX4
    // mission with no vehicle connected always produced ArduPilot commands.
    expect(effectiveMissionFirmware({ isConnected: false }, 'px4')).toBe('px4');
    expect(effectiveMissionFirmware({ isConnected: false }, 'inav')).toBe('inav');
  });
});
