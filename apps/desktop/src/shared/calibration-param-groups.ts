/**
 * Calibration parameter taxonomy for ArduPilot.
 *
 * Used by the "Load calibration from file" flow to:
 *   1. Filter a generic .param file down to only the params that encode
 *      sensor calibration (accel + compass offsets, scales, ellipsoid fit).
 *   2. Group those params by sensor (accel / mag) so the UI can show
 *      "N accel + M mag" and let the user opt in per sensor.
 *   3. Identify which params are *hardware identity* (DEV_IDs) — these are
 *      cross-checked against the live FC at load time to refuse a param set
 *      from a different physical board, and then WRITTEN as part of apply.
 *      Writing them is the actual force-accept mechanism: ArduPilot's
 *      accel/compass "calibrated" checks compare the id SAVED in storage
 *      against the detected chip (AP_InertialSensor::register_accel and
 *      Compass::configured both re-load from storage). After a param wipe
 *      (e.g. cross-flash) the FC only sets the detected id in RAM, so
 *      restoring offsets alone leaves the cal rejected forever (#16).
 *
 * Why no gyro: gyros auto-cal at boot in ArduPilot (`INS_GYR_CAL=1`, the
 * default) and the resulting offsets are reliable enough that persisting
 * them across a flash is not worth the complexity of fighting boot-time
 * recalibration. We deliberately ignore `INS_GYR*OFFS_*`, `INS_GYR*_ID`,
 * `INS_GYR*_CALTEMP`, and `INS_TCAL*` here.
 *
 * Why no lock-in flags: this flow previously auto-wrote `INS_GYR_CAL=0`
 * and `COMPASS_LEARN=0` to stop boot-time / in-flight drift over loaded
 * offsets. Operator feedback (#16) was that silently mutating unrelated
 * subsystems is surprising and unwelcome — those flags are vehicle config
 * decisions, not part of calibration. Removed.
 */

export type CalibrationCategory = 'accel' | 'mag';

export type CalibrationParamKind =
  | 'offset'   // X/Y/Z bias values from cal
  | 'scale'    // X/Y/Z scaling factors (accel only)
  | 'ellipsoid'// COMPASS_DIA_*/ODI_* — ellipsoid fit
  | 'mot'      // COMPASS_MOT_* — motor compensation
  | 'devid'    // hardware identity (chip ID); validated, then written to lock in the cal
  | 'prio'     // COMPASS_PRIO*_ID: compass priority order; written, not identity-checked
  | 'enable';  // INS_USE* / COMPASS_USE — enables the instance

export interface CalibrationParamInfo {
  category: CalibrationCategory;
  kind: CalibrationParamKind;
  /** 1, 2, or 3 — IMU/compass instance. */
  instance: 1 | 2 | 3;
}

// ── Pattern matching ─────────────────────────────────────────────────────────

interface Rule {
  test: (id: string) => RegExpMatchArray | null;
  category: CalibrationCategory;
  kind: CalibrationParamKind;
  /** Captured-group index (1-based) holding the instance digit, or 0 for "always 1". */
  instanceGroup: number;
}

// Order matters: more-specific patterns first. Each rule describes a single
// param family and how to extract the IMU/compass instance from the name.
const RULES: ReadonlyArray<Rule> = [
  // ── Accel ──
  // INS_ACCOFFS_X/Y/Z (instance 1), INS_ACC{2,3}OFFS_X/Y/Z
  { test: id => id.match(/^INS_ACC([23])?OFFS_[XYZ]$/), category: 'accel', kind: 'offset', instanceGroup: 1 },
  // INS_ACCSCAL_X/Y/Z (instance 1), INS_ACC{2,3}SCAL_X/Y/Z
  { test: id => id.match(/^INS_ACC([23])?SCAL_[XYZ]$/), category: 'accel', kind: 'scale', instanceGroup: 1 },
  // INS_ACC_ID, INS_ACC2_ID, INS_ACC3_ID
  { test: id => id.match(/^INS_ACC([23])?_ID$/), category: 'accel', kind: 'devid', instanceGroup: 1 },
  // INS_USE, INS_USE2, INS_USE3 — toggles the IMU as a whole.
  { test: id => id.match(/^INS_USE([23])?$/), category: 'accel', kind: 'enable', instanceGroup: 1 },

  // ── Compass / Mag ──
  // COMPASS_OFS_X/Y/Z (instance 1), COMPASS_OFS{2,3}_X/Y/Z
  { test: id => id.match(/^COMPASS_OFS([23])?_[XYZ]$/), category: 'mag', kind: 'offset', instanceGroup: 1 },
  // COMPASS_DIA_X/Y/Z, COMPASS_DIA{2,3}_X/Y/Z (ellipsoid diagonal)
  { test: id => id.match(/^COMPASS_DIA([23])?_[XYZ]$/), category: 'mag', kind: 'ellipsoid', instanceGroup: 1 },
  // COMPASS_ODI_X/Y/Z, COMPASS_ODI{2,3}_X/Y/Z (ellipsoid off-diagonal)
  { test: id => id.match(/^COMPASS_ODI([23])?_[XYZ]$/), category: 'mag', kind: 'ellipsoid', instanceGroup: 1 },
  // COMPASS_MOT_X/Y/Z, COMPASS_MOT{2,3}_X/Y/Z (motor interference compensation)
  { test: id => id.match(/^COMPASS_MOT([23])?_[XYZ]$/), category: 'mag', kind: 'mot', instanceGroup: 1 },
  // COMPASS_DEV_ID, COMPASS_DEV_ID2, COMPASS_DEV_ID3
  { test: id => id.match(/^COMPASS_DEV_ID([23])?$/), category: 'mag', kind: 'devid', instanceGroup: 1 },
  // COMPASS_PRIO1_ID..PRIO3_ID — priority slots. Written so multi-compass
  // ordering survives the wipe, but NOT part of identity validation: a user
  // may have reordered priorities since saving the file, and that must not
  // block the restore (DEV_IDs alone prove it's the same board).
  { test: id => id.match(/^COMPASS_PRIO([123])_ID$/), category: 'mag', kind: 'prio', instanceGroup: 1 },
  // COMPASS_USE, COMPASS_USE2, COMPASS_USE3
  { test: id => id.match(/^COMPASS_USE([23])?$/), category: 'mag', kind: 'enable', instanceGroup: 1 },
];

/**
 * Classify a param ID into a calibration category. Returns null if the
 * param is not a recognized calibration param. The matching is exact-name
 * (no prefix wildcards) so unrelated params like INS_ACC_BODYFIX, COMPASS_ENABLE,
 * INS_GYRO_RATE etc. are correctly rejected. Gyro-family params (INS_GYR*) are
 * intentionally rejected — see file header.
 */
export function categorizeCalibrationParam(paramId: string): CalibrationParamInfo | null {
  for (const rule of RULES) {
    const m = rule.test(paramId);
    if (!m) continue;
    const captured = rule.instanceGroup > 0 ? m[rule.instanceGroup] : undefined;
    const instance = captured ? (Number(captured) as 1 | 2 | 3) : 1;
    return { category: rule.category, kind: rule.kind, instance };
  }
  return null;
}

/** Convenience: just a boolean. */
export function isCalibrationParam(paramId: string): boolean {
  return categorizeCalibrationParam(paramId) !== null;
}
