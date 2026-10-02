/**
 * Where the vehicle has to be held, and whether it is there yet.
 *
 * Six-point accelerometer calibration asks the operator to place the aircraft
 * in six orientations. Telling them "Place vehicle level" in text and drawing a
 * static picture leaves them guessing whether they have it right, and a sloppy
 * position produces a calibration the flight controller still accepts. The
 * vehicle already reports its attitude, so the app can simply measure it.
 *
 * Angles are radians, in the usual MAVLink body convention: roll positive to
 * the right, pitch positive nose up.
 */

import type { AccelPosition } from './calibration-types';
import { t } from './i18n/index.js';

export interface TargetOrientation {
  /** Index into ACCEL_6POINT_POSITIONS. */
  position: AccelPosition;
  roll: number;
  pitch: number;
  /** Short instruction, phrased as an action. */
  instruction: string;
  instructionKey: string;
}

const D = Math.PI / 180;

/**
 * Target attitudes for each of the six sides, matching the order of
 * ACCEL_6POINT_POSITIONS. Yaw is deliberately unconstrained: the calibration
 * does not care which way the nose points, only which face is down.
 */
export const SIX_POINT_TARGETS: readonly TargetOrientation[] = [
  { position: 0, roll: 0, pitch: 0, instruction: 'Place the vehicle level, right way up', instructionKey: 'shared:calibrationOrientation.level' }, // i18n-exempt
  { position: 1, roll: -90 * D, pitch: 0, instruction: 'Roll the vehicle onto its LEFT side', instructionKey: 'shared:calibrationOrientation.leftSide' }, // i18n-exempt
  { position: 2, roll: 90 * D, pitch: 0, instruction: 'Roll the vehicle onto its RIGHT side', instructionKey: 'shared:calibrationOrientation.rightSide' }, // i18n-exempt
  { position: 3, roll: 0, pitch: -90 * D, instruction: 'Stand the vehicle NOSE DOWN', instructionKey: 'shared:calibrationOrientation.noseDown' }, // i18n-exempt
  { position: 4, roll: 0, pitch: 90 * D, instruction: 'Stand the vehicle NOSE UP', instructionKey: 'shared:calibrationOrientation.noseUp' }, // i18n-exempt
  { position: 5, roll: 180 * D, pitch: 0, instruction: 'Turn the vehicle UPSIDE DOWN', instructionKey: 'shared:calibrationOrientation.upsideDown' }, // i18n-exempt
];

export function targetInstruction(target: TargetOrientation): string {
  return t(target.instructionKey);
}

export function targetForPosition(position: AccelPosition): TargetOrientation {
  return SIX_POINT_TARGETS[position] ?? SIX_POINT_TARGETS[0]!;
}

/** Default tolerance. Tight enough to matter, loose enough to hold by hand. */
export const ORIENTATION_TOLERANCE_DEG = 12;

export interface OrientationMatch {
  /** True once the vehicle is within tolerance of the requested side. */
  matched: boolean;
  /** Angular distance to the target, in degrees. */
  errorDeg: number;
  /** 0 at the tolerance edge, 1 when dead on. Drives the visual lock-on. */
  closeness: number;
}

/** Shortest signed distance between two angles, in radians. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * How close the live attitude is to the requested orientation.
 *
 * Roll and pitch errors are combined as a vector rather than checked
 * separately, so "10 degrees out on both axes" correctly reads as further away
 * than 10 degrees out on one.
 */
export function matchOrientation(
  attitude: { roll: number; pitch: number },
  target: { roll: number; pitch: number },
  toleranceDeg: number = ORIENTATION_TOLERANCE_DEG,
): OrientationMatch {
  if (!Number.isFinite(attitude.roll) || !Number.isFinite(attitude.pitch)) {
    return { matched: false, errorDeg: Number.POSITIVE_INFINITY, closeness: 0 };
  }

  const dRoll = angleDelta(attitude.roll, target.roll);
  const dPitch = angleDelta(attitude.pitch, target.pitch);
  const errorDeg = Math.hypot(dRoll, dPitch) / D;

  return {
    matched: errorDeg <= toleranceDeg,
    errorDeg,
    closeness: Math.max(0, Math.min(1, 1 - errorDeg / toleranceDeg)),
  };
}

/**
 * Live guidance while the operator moves the aircraft. Returns null once the
 * position is held, so the UI can switch from "correct it" to "hold it".
 */
export function orientationHint(
  attitude: { roll: number; pitch: number },
  target: TargetOrientation,
  toleranceDeg: number = ORIENTATION_TOLERANCE_DEG,
): string | null {
  const { matched } = matchOrientation(attitude, target, toleranceDeg);
  if (matched) return null;

  const dRoll = angleDelta(attitude.roll, target.roll) / D;
  const dPitch = angleDelta(attitude.pitch, target.pitch) / D;

  // Name the single biggest correction: two instructions at once is noise.
  if (Math.abs(dRoll) >= Math.abs(dPitch)) {
    const deg = Math.round(Math.abs(dRoll));
    return dRoll > 0 ? t('shared:calibrationOrientation.rollLeft', { deg }) : t('shared:calibrationOrientation.rollRight', { deg });
  }
  const deg = Math.round(Math.abs(dPitch));
  return dPitch > 0 ? t('shared:calibrationOrientation.pitchDown', { deg }) : t('shared:calibrationOrientation.pitchUp', { deg });
}
