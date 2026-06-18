import { describe, it, expect } from 'vitest';
import { isPreArmMessage, extractPreArmReason, matchPreArmError } from '../prearm-checks.js';

describe('isPreArmMessage', () => {
  it('detects ArduPilot pre-arm messages by default', () => {
    expect(isPreArmMessage('PreArm: Motors: Check frame class')).toBe(true);
    expect(isPreArmMessage('Arm: Motors: Check frame class')).toBe(true);
    expect(isPreArmMessage('EKF2 IMU0 is using GPS')).toBe(false);
  });

  it('does not treat PX4 wording as a pre-arm message under ArduPilot default', () => {
    expect(isPreArmMessage('Arming denied: GPS not ready')).toBe(false);
    expect(isPreArmMessage('Preflight Fail: Compass not calibrated')).toBe(false);
  });

  it('detects PX4 pre-arm messages when firmware is px4', () => {
    expect(isPreArmMessage('Arming denied: GPS not ready', 'px4')).toBe(true);
    expect(isPreArmMessage('Preflight Fail: Compass not calibrated', 'px4')).toBe(true);
    expect(isPreArmMessage('Preflight: high vibration', 'px4')).toBe(true);
    expect(isPreArmMessage('PreArm: Motors: Check frame class', 'px4')).toBe(false);
  });
});

describe('extractPreArmReason', () => {
  it('extracts the ArduPilot reason', () => {
    expect(extractPreArmReason('PreArm: Motors: Check frame class')).toBe('Motors: Check frame class');
  });

  it('extracts the PX4 reason', () => {
    expect(extractPreArmReason('Arming denied: GPS not ready', 'px4')).toBe('GPS not ready');
    expect(extractPreArmReason('Preflight Fail: Compass not calibrated', 'px4')).toBe('Compass not calibrated');
  });
});

describe('matchPreArmError ArduPilot (default)', () => {
  it('matches the ArduPilot frame-class pattern', () => {
    const result = matchPreArmError('PreArm: Motors: Check frame class');
    expect(result).not.toBeNull();
    expect(result!.pattern.category).toBe('motors');
    expect(result!.pattern.fix.params).toContain('FRAME_CLASS');
  });

  it('matches the ArduPilot compass-calibration pattern', () => {
    const result = matchPreArmError('PreArm: Compass not calibrated');
    expect(result!.pattern.fix.action).toBe('calibrate-compass');
  });

  it('falls back to ARMING_CHECK for unknown ArduPilot reasons', () => {
    const result = matchPreArmError('PreArm: Some brand new check');
    expect(result!.pattern.fix.params).toContain('ARMING_CHECK');
  });

  it('returns null for non-pre-arm text', () => {
    expect(matchPreArmError('EKF2 IMU0 is using GPS')).toBeNull();
  });

  it('does not match a PX4 message under ArduPilot default', () => {
    expect(matchPreArmError('Arming denied: GPS not ready')).toBeNull();
  });
});

describe('matchPreArmError PX4', () => {
  it('matches GPS / position estimate', () => {
    const result = matchPreArmError('Arming denied: GPS not ready', 'px4');
    expect(result).not.toBeNull();
    expect(result!.pattern.category).toBe('gps');
    expect(result!.pattern.fix.params).toContain('COM_ARM_WO_GPS');
  });

  it('matches compass calibration', () => {
    const result = matchPreArmError('Preflight Fail: Compass not calibrated', 'px4');
    expect(result!.pattern.category).toBe('sensors');
    expect(result!.pattern.fix.action).toBe('calibrate-compass');
  });

  it('matches accelerometer calibration', () => {
    const result = matchPreArmError('Preflight Fail: Accel not calibrated', 'px4');
    expect(result!.pattern.fix.action).toBe('calibrate-accel');
  });

  it('matches RC not configured', () => {
    const result = matchPreArmError('Arming denied: RC not calibrated', 'px4');
    expect(result!.pattern.category).toBe('rc');
    expect(result!.pattern.fix.params).toContain('COM_RC_IN_MODE');
  });

  it('matches battery low', () => {
    const result = matchPreArmError('Preflight Fail: Battery low', 'px4');
    expect(result!.pattern.category).toBe('battery');
    expect(result!.pattern.fix.params).toContain('BAT_LOW_THR');
  });

  it('matches geofence', () => {
    const result = matchPreArmError('Arming denied: Geofence violation', 'px4');
    expect(result!.pattern.fix.params).toContain('GF_ACTION');
  });

  it('matches kill switch', () => {
    const result = matchPreArmError('Arming denied: Kill switch engaged', 'px4');
    expect(result!.pattern.category).toBe('system');
  });

  it('falls back to PX4 generic for unknown PX4 reasons', () => {
    const result = matchPreArmError('Arming denied: some unrecognized condition', 'px4');
    expect(result).not.toBeNull();
    expect(result!.pattern.fix.params).toContain('COM_ARM_WO_GPS');
  });

  it('does not match an ArduPilot message under PX4 firmware', () => {
    expect(matchPreArmError('PreArm: Motors: Check frame class', 'px4')).toBeNull();
  });
});
