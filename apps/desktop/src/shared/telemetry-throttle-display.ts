import type { ArduPilotVehicleClass } from './telemetry-types';

/** Map ESC PWM (µs) to 0–100% for HUD (1000 = 0%, 2000 = 100%). */
export function motorPwmToDisplayPercent(pwm: number): number {
  if (!Number.isFinite(pwm) || pwm <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((pwm - 1000) / 1000) * 100)));
}

/**
 * Mean PWM of the first `count` outputs that look like motor PWM (1000–2000 µs).
 * Ignores zeros / invalid. Returns null if nothing usable.
 */
export function meanMotorishServoPwm(outputs: readonly number[], count = 8): number | null {
  const slice = outputs.slice(0, count).filter((p) => Number.isFinite(p) && p >= 1000 && p <= 2000);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export type ThrottleDisplaySource = 'vfr_hud' | 'servo_pwm';

/**
 * HUD throttle: ArduPilot `VFR_HUD.throttle` often tracks RC / pilot input. In AUTO
 * the stick can stay low while motors are driven — then prefer SERVO_OUTPUT_RAW
 * (mean of motor-like channels) on multicopter / VTOL.
 */
export function effectiveThrottleDisplayPercent(args: {
  vfrThrottle: number;
  armed: boolean;
  servoOutputs: readonly number[] | null | undefined;
  servoLastUpdateMs: number;
  nowMs: number;
  vehicleClass: ArduPilotVehicleClass;
}): { value: number; source: ThrottleDisplaySource } {
  const vfr = Math.max(0, Math.min(100, Math.round(args.vfrThrottle)));

  const useServoClass = args.vehicleClass === 'copter' || args.vehicleClass === 'vtol';
  const servoFresh =
    args.servoLastUpdateMs > 0 && args.nowMs - args.servoLastUpdateMs < 500;

  if (!useServoClass || !args.armed || !servoFresh || !args.servoOutputs?.length) {
    return { value: vfr, source: 'vfr_hud' };
  }

  const meanPwm = meanMotorishServoPwm(args.servoOutputs);
  if (meanPwm == null) {
    return { value: vfr, source: 'vfr_hud' };
  }

  const fromServo = motorPwmToDisplayPercent(meanPwm);

  if (fromServo > vfr + 2) {
    return { value: fromServo, source: 'servo_pwm' };
  }
  if (vfr <= 3 && fromServo >= 4) {
    return { value: fromServo, source: 'servo_pwm' };
  }

  return { value: vfr, source: 'vfr_hud' };
}
