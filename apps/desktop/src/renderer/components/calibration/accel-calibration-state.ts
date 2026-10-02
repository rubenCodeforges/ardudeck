/**
 * Whether the board actually carries a 3D accelerometer calibration.
 *
 * ArduPilot refuses to arm with "3D Accel calibration needed" when
 * `accel_calibrated_ok_all()` fails, and that function only looks at the offsets
 * and scales the SIX-POINT calibration writes (INS_ACCOFFS_*, INS_ACCSCAL_*).
 * The level calibration writes AHRS_TRIM_* and nothing else, so running it and
 * rebooting can never clear that refusal, which reads as the vehicle ignoring a
 * calibration that visibly succeeded.
 */

import { t } from '../../../shared/i18n/index.js';

export interface AccelCalibrationState {
  /** False when at least one accelerometer has no stored calibration. */
  calibrated: boolean;
  /** Instances (1-based, as the parameters are named) that are missing it. */
  missing: number[];
  /** True when the board reported no accelerometer parameters at all. */
  unknown: boolean;
}

const MAX_INSTANCES = 3;

function suffix(instance: number): string {
  return instance === 1 ? '' : String(instance);
}

/** Reads through a parameter getter, so it works against the store or a test. */
export function accelCalibrationState(
  get: (name: string) => number | undefined,
): AccelCalibrationState {
  const missing: number[] = [];
  let seen = 0;

  for (let i = 1; i <= MAX_INSTANCES; i++) {
    const s = suffix(i);
    const id = get(`INS_ACC${s}_ID`) ?? get(`INS_ACC${s}ID`);
    // Instance not fitted: ArduPilot leaves its id at zero.
    if (id === undefined) continue;
    seen++;
    if (id === 0) continue;

    const offsets = ['X', 'Y', 'Z'].map((axis) => get(`INS_ACC${s}OFFS_${axis}`));
    const scales = ['X', 'Y', 'Z'].map((axis) => get(`INS_ACC${s}SCAL_${axis}`));
    if (offsets.some((v) => v === undefined) || scales.some((v) => v === undefined)) continue;

    const offsetsZero = offsets.every((v) => v === 0);
    const scalesZero = scales.every((v) => v === 0);
    if (offsetsZero || scalesZero) missing.push(i);
  }

  return { calibrated: seen > 0 && missing.length === 0, missing, unknown: seen === 0 };
}

/** One line for the operator, or null when there is nothing to say. */
export function accelCalibrationNote(state: AccelCalibrationState): string | null {
  if (state.unknown || state.calibrated) return null;
  return t('calibration:accelCalibrationState.note', {
    count: state.missing.length,
    which: state.missing.join(t('calibration:accelCalibrationState.joinAnd')),
  });
}
