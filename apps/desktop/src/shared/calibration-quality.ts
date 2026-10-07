/**
 * Did the calibration actually work, and is it still there?
 *
 * A flight controller reporting "success" is not the same as a good
 * calibration, and a calibration that was accepted is not the same as one that
 * survived the reboot. Both gaps have put aircraft in the ground: the wizard
 * said done, the FC rebooted, and the operator assumed it was fine.
 *
 * This module answers both questions from numbers, so the UI never has to say
 * "probably".
 */

import { t } from './i18n/index.js';

export type CalibrationVerdict = 'good' | 'marginal' | 'bad' | 'unknown';

/**
 * A calibration as stored per board: what it wrote, how good it was, and
 * whether it was still there after the reboot.
 */
export interface CalibrationRecordIpc {
  type: string;
  written: Record<string, number>;
  verdict: CalibrationVerdict | string;
  summary: string;
  completedAt: number;
  persistence: null | {
    state: CalibrationPersistence | string;
    summary: string;
    mismatched: string[];
    checkedAt: number;
  };
}

export interface CalibrationAssessment {
  verdict: CalibrationVerdict;
  /** One line stating the measured value and what it means. */
  summary: string;
  /** What to do about it, when it is not good. */
  advice?: string;
}

// ── Compass ──────────────────────────────────────────────────────────────────

/**
 * Compass fitness is the RMS residual of the sphere fit, in milligauss.
 *
 * Two different numbers matter and they are easy to confuse:
 *   - what a GOOD calibration looks like in practice: under about 3.5
 *   - what ArduPilot will ACCEPT: COMPASS_CAL_FIT, default 16 (its own scale
 *     is 4 very strict, 8 strict, 16 default, 32 relaxed)
 *
 * Everything between the two is the dangerous band: the flight controller
 * reports SUCCESS, the wizard goes green, and the heading still drifts in the
 * air. That band is called out rather than passed.
 */
export const COMPASS_FITNESS_GOOD = 3.5;
export const COMPASS_FITNESS_DEFAULT_LIMIT = 16;

export function assessCompassFitness(
  fitness: number,
  calFitThreshold: number = COMPASS_FITNESS_DEFAULT_LIMIT,
): CalibrationAssessment {
  if (!Number.isFinite(fitness) || fitness < 0) {
    return { verdict: 'unknown', summary: t('shared:calibrationQuality.noFitness') };
  }
  const value = t('shared:calibrationQuality.fitnessValue', { value: fitness.toFixed(1) });

  if (fitness > calFitThreshold) {
    return {
      verdict: 'bad',
      summary: t('shared:calibrationQuality.fitnessRejected', { value, limit: calFitThreshold.toFixed(0) }),
      advice: t('shared:calibrationQuality.fitnessRejectedAdvice'),
    };
  }
  if (fitness > COMPASS_FITNESS_GOOD) {
    return {
      verdict: 'marginal',
      summary: t('shared:calibrationQuality.fitnessWeak', { value }),
      advice: t('shared:calibrationQuality.fitnessWeakAdvice', { good: COMPASS_FITNESS_GOOD }),
    };
  }
  return { verdict: 'good', summary: t('shared:calibrationQuality.fitnessGood', { value }) };
}

// ── Accelerometer ────────────────────────────────────────────────────────────

/**
 * ArduPilot refuses to arm when an accel offset vector exceeds 3.5 m/s/s or a
 * scale factor falls outside 0.8..1.2. Warning only at those limits is too
 * late, so a tighter band flags a calibration that passed but is drifting.
 */
export const ACCEL_OFFSET_ARM_LIMIT = 3.5;
export const ACCEL_OFFSET_GOOD = 1.5;
export const ACCEL_SCALE_ARM_MARGIN = 0.2;
export const ACCEL_SCALE_GOOD_MARGIN = 0.05;

export interface AccelCalibrationValues {
  /** INS_ACCOFFS_X/Y/Z in m/s/s. */
  offsets?: { x: number; y: number; z: number };
  /** INS_ACCSCAL_X/Y/Z, nominally 1.0. */
  scales?: { x: number; y: number; z: number };
}

export function assessAccelCalibration(values: AccelCalibrationValues): CalibrationAssessment {
  const { offsets, scales } = values;
  if (!offsets && !scales) {
    return { verdict: 'unknown', summary: t('shared:calibrationQuality.accelNotRead') };
  }

  // An untouched board reads exactly zero offsets and exactly 1.0 scales. That
  // is the signature of "never calibrated", not of a perfect calibration.
  const allZero = offsets && offsets.x === 0 && offsets.y === 0 && offsets.z === 0;
  const allUnity = scales && scales.x === 1 && scales.y === 1 && scales.z === 1;
  if (allZero && allUnity) {
    return {
      verdict: 'bad',
      summary: t('shared:calibrationQuality.accelFactoryDefaults'),
      advice: t('shared:calibrationQuality.accelFactoryDefaultsAdvice'),
    };
  }

  const offsetLength = offsets
    ? Math.hypot(offsets.x, offsets.y, offsets.z)
    : null;
  const scaleError = scales
    ? Math.max(Math.abs(scales.x - 1), Math.abs(scales.y - 1), Math.abs(scales.z - 1))
    : null;

  if (offsetLength !== null && offsetLength >= ACCEL_OFFSET_ARM_LIMIT) {
    return {
      verdict: 'bad',
      summary: t('shared:calibrationQuality.accelOffsetsPastLimit', { offsets: offsetLength.toFixed(2), limit: ACCEL_OFFSET_ARM_LIMIT }),
      advice: t('shared:calibrationQuality.accelOffsetsPastLimitAdvice'),
    };
  }
  if (scaleError !== null && scaleError > ACCEL_SCALE_ARM_MARGIN) {
    return {
      verdict: 'bad',
      summary: t('shared:calibrationQuality.accelScalePastLimit', { percent: (scaleError * 100).toFixed(0) }),
      advice: t('shared:calibrationQuality.accelScalePastLimitAdvice'),
    };
  }
  if (
    (offsetLength !== null && offsetLength > ACCEL_OFFSET_GOOD) ||
    (scaleError !== null && scaleError > ACCEL_SCALE_GOOD_MARGIN)
  ) {
    return {
      verdict: 'marginal',
      summary: offsetLength !== null && offsetLength > ACCEL_OFFSET_GOOD
        ? t('shared:calibrationQuality.accelOffsetsHigh', { offsets: offsetLength.toFixed(2) })
        : t('shared:calibrationQuality.accelScaleHigh', { percent: ((scaleError ?? 0) * 100).toFixed(0) }),
      advice: t('shared:calibrationQuality.accelDriftingAdvice'),
    };
  }

  return {
    verdict: 'good',
    summary: offsetLength !== null
      ? t('shared:calibrationQuality.accelGoodOffsets', { offsets: offsetLength.toFixed(2) })
      : t('shared:calibrationQuality.accelGood'),
  };
}

// ── Did it survive the reboot? ───────────────────────────────────────────────

export type CalibrationPersistence = 'verified' | 'not-persisted' | 'changed' | 'unverified';

export interface PersistenceResult {
  state: CalibrationPersistence;
  summary: string;
  /** Parameters that did not come back as written. */
  mismatched: string[];
}

/**
 * Compare the calibration parameters read back AFTER a reboot against what the
 * calibration wrote. This is the check whose absence lets an operator assume a
 * rebooted flight controller kept a calibration it actually discarded.
 *
 * Values are compared with a relative tolerance because the FC round-trips them
 * through float32 and its own parameter storage.
 */
export function verifyCalibrationPersisted(
  written: Record<string, number>,
  readBack: Record<string, number | undefined>,
  tolerance = 1e-3,
): PersistenceResult {
  const names = Object.keys(written);
  if (names.length === 0) {
    return { state: 'unverified', summary: t('shared:calibrationQuality.nothingToVerify'), mismatched: [] };
  }

  const missing: string[] = [];
  const mismatched: string[] = [];

  for (const name of names) {
    const after = readBack[name];
    if (after === undefined) {
      missing.push(name);
      continue;
    }
    const before = written[name]!;
    const scale = Math.max(1, Math.abs(before));
    if (Math.abs(after - before) > tolerance * scale) mismatched.push(name);
  }

  if (missing.length === names.length) {
    return {
      state: 'unverified',
      summary: t('shared:calibrationQuality.readBackFailed'),
      mismatched: missing,
    };
  }
  if (mismatched.length > 0 || missing.length > 0) {
    const lost = [...mismatched, ...missing];
    return {
      state: 'not-persisted',
      summary: t('shared:calibrationQuality.notPersisted', { count: lost.length }),
      mismatched: lost,
    };
  }

  return { state: 'verified', summary: t('shared:calibrationQuality.persisted'), mismatched: [] };
}

// ── Outcome of one run ───────────────────────────────────────────────────────

const VERDICT_RANK: Record<string, number> = { good: 0, unknown: 1, marginal: 2, bad: 3 };

/** How good a finished calibration is, from what it wrote. The worst compass decides a compass run. */
export function assessCalibrationOutcome(
  calType: string,
  written: Record<string, number>,
  compassFitnesses: number[],
): CalibrationAssessment {
  if (calType === 'compass') {
    if (compassFitnesses.length === 0) {
      return { verdict: 'unknown', summary: t('shared:calibrationQuality.noCompassFitness') };
    }
    return compassFitnesses
      .map((f) => assessCompassFitness(f))
      .reduce((worst, next) => ((VERDICT_RANK[next.verdict] ?? 0) > (VERDICT_RANK[worst.verdict] ?? 0) ? next : worst));
  }
  if (calType === 'accel-6point') {
    const num = (name: string): number | undefined => written[name];
    const offsets = num('INS_ACCOFFS_X') !== undefined
      ? { x: num('INS_ACCOFFS_X')!, y: num('INS_ACCOFFS_Y') ?? 0, z: num('INS_ACCOFFS_Z') ?? 0 }
      : undefined;
    const scales = num('INS_ACCSCAL_X') !== undefined
      ? { x: num('INS_ACCSCAL_X')!, y: num('INS_ACCSCAL_Y') ?? 1, z: num('INS_ACCSCAL_Z') ?? 1 }
      : undefined;
    return assessAccelCalibration({ offsets, scales });
  }
  return { verdict: 'unknown', summary: t('shared:calibrationQuality.recorded') };
}

export function buildCalibrationRecord(
  calType: string,
  written: Record<string, number>,
  compassFitnesses: number[],
  completedAt = Date.now(),
): CalibrationRecordIpc {
  const a = assessCalibrationOutcome(calType, written, compassFitnesses);
  return {
    type: calType,
    written,
    verdict: a.verdict,
    summary: a.advice ? `${a.summary} ${a.advice}` : a.summary,
    completedAt,
    persistence: null,
  };
}
