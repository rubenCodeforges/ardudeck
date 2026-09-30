/**
 * Arming checks across firmware generations.
 *
 * Up to ArduPilot 4.6 the parameter was ARMING_CHECK, a mask of checks to RUN,
 * with bit 0 meaning "all". From 4.7 it is ARMING_SKIPCHK, a mask of checks to
 * SKIP, where 0 means everything runs and -1 skips every non-mandatory one.
 * Same bit positions, opposite meaning, so a UI written against one silently
 * inverts on the other: showing every check as disabled, or worse, turning them
 * off while claiming to turn them on.
 */

export type ArmingParam = 'ARMING_CHECK' | 'ARMING_SKIPCHK';

export interface ArmingModel {
  param: ArmingParam;
  /** 'run' = bits are checks that run; 'skip' = bits are checks that are skipped. */
  sense: 'run' | 'skip';
}

export interface ArmingCheckBit {
  /** Bit index, identical in both parameters. */
  bit: number;
  name: string;
  nameKey?: string;
  description: string;
  descriptionKey?: string;
  /** Plane-only check, hidden elsewhere. */
  planeOnly?: boolean;
}

/** Bit list from AP_Arming's own documentation. Bit 0 was "all" on the old
 * parameter and has no equivalent on the new one. */
export const ARMING_CHECK_BITS: ArmingCheckBit[] = [
  { bit: 1, name: 'Barometer', nameKey: 'mavlink.auto.barometer', description: 'Barometer health', descriptionKey: 'mavlink.auto.barometer-health' },
  { bit: 2, name: 'Compass', nameKey: 'mavlink.auto.compass', description: 'Compass health and calibration', descriptionKey: 'mavlink.auto.compass-health-and-calibration' },
  { bit: 3, name: 'GPS lock', nameKey: 'mavlink.auto.gps-lock', description: 'Position fix before arming', descriptionKey: 'mavlink.auto.position-fix-before-arming' },
  { bit: 4, name: 'INS', description: 'Accelerometer and gyro health', descriptionKey: 'mavlink.auto.accelerometer-and-gyro-health' },
  { bit: 5, name: 'Parameters', nameKey: 'mavlink.auto.parameters', description: 'Parameter sanity', descriptionKey: 'mavlink.auto.parameter-sanity' },
  { bit: 6, name: 'RC channels', nameKey: 'mavlink.auto.rc-channels', description: 'Receiver calibrated and present', descriptionKey: 'mavlink.auto.receiver-calibrated-and-present' },
  { bit: 7, name: 'Board voltage', nameKey: 'mavlink.auto.board-voltage', description: 'Autopilot supply within range', descriptionKey: 'mavlink.auto.autopilot-supply-within-range' },
  { bit: 8, name: 'Battery level', nameKey: 'mavlink.auto.battery-level', description: 'Pack above the arming threshold', descriptionKey: 'mavlink.auto.pack-above-the-arming-threshold' },
  { bit: 9, name: 'Airspeed', nameKey: 'mavlink.auto.airspeed', description: 'Airspeed sensor health', descriptionKey: 'mavlink.auto.airspeed-sensor-health', planeOnly: true },
  { bit: 10, name: 'Logging', nameKey: 'mavlink.auto.logging', description: 'Logging is running (needs a card)', descriptionKey: 'mavlink.auto.logging-is-running-needs-a-card' },
  { bit: 11, name: 'Safety switch', nameKey: 'mavlink.auto.safety-switch', description: 'Hardware safety switch released', descriptionKey: 'mavlink.auto.hardware-safety-switch-released' },
  { bit: 12, name: 'GPS configuration', nameKey: 'mavlink.auto.gps-configuration', description: 'Receiver configured as expected', descriptionKey: 'mavlink.auto.receiver-configured-as-expected' },
  { bit: 13, name: 'System', nameKey: 'mavlink.auto.system', description: 'Overall system health', descriptionKey: 'mavlink.auto.overall-system-health' },
  { bit: 14, name: 'Mission', nameKey: 'mavlink.auto.mission', description: 'Loaded mission is valid', descriptionKey: 'mavlink.auto.loaded-mission-is-valid' },
  { bit: 15, name: 'Rangefinder', nameKey: 'mavlink.auto.rangefinder', description: 'Rangefinder health', descriptionKey: 'mavlink.auto.rangefinder-health' },
  { bit: 16, name: 'Camera', nameKey: 'mavlink.auto.camera', description: 'Camera and gimbal health', descriptionKey: 'mavlink.auto.camera-and-gimbal-health' },
  { bit: 17, name: 'AuxAuth', nameKey: 'mavlink.auto.auxauth', description: 'Authorisation from a companion computer', descriptionKey: 'mavlink.auto.authorisation-from-a-companion-computer' },
  { bit: 18, name: 'Visual odometry', nameKey: 'mavlink.auto.visual-odometry', description: 'Visual odometry health', descriptionKey: 'mavlink.auto.visual-odometry-health' },
  { bit: 19, name: 'FFT', description: 'In-flight FFT health', descriptionKey: 'mavlink.auto.in-flight-fft-health' },
];

/** Which parameter this board speaks. SKIPCHK wins when both are present, as
 * that is the one 4.7 acts on. */
export function detectArmingModel(has: (param: string) => boolean): ArmingModel | null {
  if (has('ARMING_SKIPCHK')) return { param: 'ARMING_SKIPCHK', sense: 'skip' };
  if (has('ARMING_CHECK')) return { param: 'ARMING_CHECK', sense: 'run' };
  return null;
}

/** Value meaning "every check runs". */
export function allChecksValue(model: ArmingModel): number {
  return model.sense === 'skip' ? 0 : 1;
}

/** Value meaning "skip everything that may be skipped". */
export function noChecksValue(model: ArmingModel): number {
  return model.sense === 'skip' ? -1 : 0;
}

export function isAllChecks(model: ArmingModel, value: number): boolean {
  return value === allChecksValue(model);
}

export function isNoChecks(model: ArmingModel, value: number): boolean {
  return value === noChecksValue(model);
}

/** True when this check runs, whichever way the parameter is written. */
export function isCheckEnabled(model: ArmingModel, value: number, bit: number): boolean {
  if (model.sense === 'skip') {
    if (value === -1) return false;
    return (value & (1 << bit)) === 0;
  }
  if (value === 1) return true;
  return (value & (1 << bit)) !== 0;
}

/**
 * The value that flips one check, expanding the shorthand first: "all" on the
 * old parameter and -1 on the new one carry no per-bit detail, so turning one
 * check off from either would otherwise change every other check too.
 */
export function toggleCheck(
  model: ArmingModel,
  value: number,
  bit: number,
  bits: ArmingCheckBit[] = ARMING_CHECK_BITS,
): number {
  const mask = bits.reduce((acc, b) => acc | (1 << b.bit), 0);
  if (model.sense === 'skip') {
    const base = value === -1 ? mask : value;
    return base ^ (1 << bit);
  }
  const base = value === 1 ? mask : value;
  return base ^ (1 << bit);
}

/** The value with one check forced off, used where a card offers to silence a
 * specific refusal (logging with no SD card, say). */
export function withCheckDisabled(
  model: ArmingModel,
  value: number,
  bit: number,
  bits: ArmingCheckBit[] = ARMING_CHECK_BITS,
): number {
  if (!isCheckEnabled(model, value, bit)) return value;
  return toggleCheck(model, value, bit, bits);
}
