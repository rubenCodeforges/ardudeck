import { describe, it, expect } from 'vitest';
import {
  motorPwmToDisplayPercent,
  meanMotorishServoPwm,
  effectiveThrottleDisplayPercent,
} from './telemetry-throttle-display';

describe('motorPwmToDisplayPercent', () => {
  it('maps 1000–2000 µs to 0–100%', () => {
    expect(motorPwmToDisplayPercent(1000)).toBe(0);
    expect(motorPwmToDisplayPercent(1500)).toBe(50);
    expect(motorPwmToDisplayPercent(2000)).toBe(100);
  });
});

describe('effectiveThrottleDisplayPercent', () => {
  const now = 1_000_000;
  const motorsHover = [1450, 1460, 1440, 1455, 0, 0, 0, 0];

  it('uses servo-derived % when VFR is ~0 in AUTO-style case (copter)', () => {
    const r = effectiveThrottleDisplayPercent({
      vfrThrottle: 0,
      armed: true,
      servoOutputs: motorsHover,
      servoLastUpdateMs: now - 100,
      nowMs: now,
      vehicleClass: 'copter',
    });
    expect(r.source).toBe('servo_pwm');
    expect(r.value).toBeGreaterThan(30);
    expect(r.value).toBeLessThanOrEqual(50);
  });

  it('keeps VFR when it already reflects thrust (Guided takeoff)', () => {
    const r = effectiveThrottleDisplayPercent({
      vfrThrottle: 55,
      armed: true,
      servoOutputs: motorsHover,
      servoLastUpdateMs: now - 100,
      nowMs: now,
      vehicleClass: 'copter',
    });
    expect(r.source).toBe('vfr_hud');
    expect(r.value).toBe(55);
  });

  it('does not use servo blend for plane', () => {
    const r = effectiveThrottleDisplayPercent({
      vfrThrottle: 0,
      armed: true,
      servoOutputs: motorsHover,
      servoLastUpdateMs: now - 100,
      nowMs: now,
      vehicleClass: 'plane',
    });
    expect(r.source).toBe('vfr_hud');
    expect(r.value).toBe(0);
  });

  it('ignores stale servo data', () => {
    const r = effectiveThrottleDisplayPercent({
      vfrThrottle: 0,
      armed: true,
      servoOutputs: motorsHover,
      servoLastUpdateMs: now - 2000,
      nowMs: now,
      vehicleClass: 'copter',
    });
    expect(r.source).toBe('vfr_hud');
  });
});

describe('meanMotorishServoPwm', () => {
  it('returns null when no motor-range PWM', () => {
    expect(meanMotorishServoPwm([0, 0, 500])).toBeNull();
  });
});
