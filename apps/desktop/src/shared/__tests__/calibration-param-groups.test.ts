import { describe, it, expect } from 'vitest';
import {
  categorizeCalibrationParam,
  isCalibrationParam,
} from '../calibration-param-groups.js';

describe('categorizeCalibrationParam', () => {
  describe('accel', () => {
    it.each([
      ['INS_ACCOFFS_X', 'offset', 1],
      ['INS_ACCOFFS_Y', 'offset', 1],
      ['INS_ACCOFFS_Z', 'offset', 1],
      ['INS_ACC2OFFS_X', 'offset', 2],
      ['INS_ACC2OFFS_Y', 'offset', 2],
      ['INS_ACC2OFFS_Z', 'offset', 2],
      ['INS_ACC3OFFS_X', 'offset', 3],
      ['INS_ACCSCAL_X', 'scale', 1],
      ['INS_ACCSCAL_Y', 'scale', 1],
      ['INS_ACCSCAL_Z', 'scale', 1],
      ['INS_ACC2SCAL_X', 'scale', 2],
      ['INS_ACC3SCAL_Z', 'scale', 3],
      ['INS_ACC_ID', 'devid', 1],
      ['INS_ACC2_ID', 'devid', 2],
      ['INS_ACC3_ID', 'devid', 3],
      ['INS_USE', 'enable', 1],
      ['INS_USE2', 'enable', 2],
      ['INS_USE3', 'enable', 3],
    ])('%s → accel/%s instance %d', (id, kind, instance) => {
      const r = categorizeCalibrationParam(id);
      expect(r).not.toBeNull();
      expect(r?.category).toBe('accel');
      expect(r?.kind).toBe(kind);
      expect(r?.instance).toBe(instance);
    });
  });

  describe('mag', () => {
    it.each([
      ['COMPASS_OFS_X', 'offset', 1],
      ['COMPASS_OFS_Y', 'offset', 1],
      ['COMPASS_OFS_Z', 'offset', 1],
      ['COMPASS_OFS2_X', 'offset', 2],
      ['COMPASS_OFS2_Y', 'offset', 2],
      ['COMPASS_OFS2_Z', 'offset', 2],
      ['COMPASS_OFS3_X', 'offset', 3],
      ['COMPASS_DIA_X', 'ellipsoid', 1],
      ['COMPASS_DIA2_Y', 'ellipsoid', 2],
      ['COMPASS_DIA3_Z', 'ellipsoid', 3],
      ['COMPASS_ODI_X', 'ellipsoid', 1],
      ['COMPASS_ODI2_X', 'ellipsoid', 2],
      ['COMPASS_ODI3_Z', 'ellipsoid', 3],
      ['COMPASS_MOT_X', 'mot', 1],
      ['COMPASS_MOT2_Y', 'mot', 2],
      ['COMPASS_MOT3_Z', 'mot', 3],
      ['COMPASS_DEV_ID', 'devid', 1],
      ['COMPASS_DEV_ID2', 'devid', 2],
      ['COMPASS_DEV_ID3', 'devid', 3],
      ['COMPASS_PRIO1_ID', 'prio', 1],
      ['COMPASS_PRIO2_ID', 'prio', 2],
      ['COMPASS_PRIO3_ID', 'prio', 3],
      ['COMPASS_USE', 'enable', 1],
      ['COMPASS_USE2', 'enable', 2],
      ['COMPASS_USE3', 'enable', 3],
    ])('%s → mag/%s instance %d', (id, kind, instance) => {
      const r = categorizeCalibrationParam(id);
      expect(r).not.toBeNull();
      expect(r?.category).toBe('mag');
      expect(r?.kind).toBe(kind);
      expect(r?.instance).toBe(instance);
    });
  });

  describe('gyro params are intentionally rejected', () => {
    // Gyro auto-cals at boot in ArduPilot, so the force-accept flow ignores
    // INS_GYR* entirely. If gyro support is ever added back, these tests
    // will fail loudly and force a deliberate decision.
    it.each([
      'INS_GYROFFS_X',
      'INS_GYROFFS_Y',
      'INS_GYROFFS_Z',
      'INS_GYR2OFFS_X',
      'INS_GYR3OFFS_Z',
      'INS_GYR_ID',
      'INS_GYR2_ID',
      'INS_GYR3_ID',
      'INS_GYR_CALTEMP',
      'INS_GYR1_CALTEMP',
      'INS_GYR2_CALTEMP',
      'INS_GYR3_CALTEMP',
      'INS_TCAL1_ENABLE',
      'INS_TCAL1_TMIN',
      'INS_TCAL2_TMAX',
      'INS_TCAL3_TMIN',
      'INS_GYR_CAL',
    ])('rejects gyro param %s', (id) => {
      expect(categorizeCalibrationParam(id)).toBeNull();
    });
  });

  describe('rejections — non-cal params must return null', () => {
    // Sentinel values: things that LOOK like cal params but aren't.
    // Especially important — the regexes must not silently match these.
    it.each([
      // Tunable params that share INS_/COMPASS_ prefix
      'INS_GYRO_RATE',           // sample rate config, not cal data
      'INS_FAST_SAMPLE',
      'INS_LOG_BAT_MASK',
      'INS_HNTCH_ENABLE',        // harmonic notch — software, not cal
      'INS_NOTCH_ENABLE',
      'INS_POS1_X',              // IMU position offset (software config)
      'INS_TRIM_OPTION',
      'INS_ACCEL_FILTER',        // filter Hz — config not cal
      'INS_GYRO_FILTER',
      'COMPASS_ENABLE',          // master enable, not per-instance
      'COMPASS_LEARN',           // not part of cal data (and intentionally never auto-written)
      'COMPASS_AUTODEC',
      'COMPASS_DEC',             // declination — vehicle config, not chip cal
      'COMPASS_ORIENT',
      'COMPASS_ORIENT2',
      'COMPASS_AUTO_ROT',
      'COMPASS_EXTERNAL',        // hardware-bus config, handled by sitl-unsafe filter
      // Unrelated families
      'BATT_MONITOR',
      'ACRO_BAL_PITCH',
      'SIM_BATT_VOLTAGE',
      'BARO_DEVID',
      'GPS_TYPE',
      'EK3_IMU_MASK',
      // Edge cases — empty / odd
      '',
      'INS',
      'INS_',
      'COMPASS',
      'COMPASS_',
      // Common typos / partial matches that must be rejected
      'INS_ACCOFFS',
      'INS_ACCOFFS_',
      'INS_ACCOFFS_W',           // not X/Y/Z
      'COMPASS_OFS',             // missing _X
      'COMPASS_OFS_W',           // not X/Y/Z
    ])('rejects %s', (id) => {
      expect(categorizeCalibrationParam(id)).toBeNull();
      expect(isCalibrationParam(id)).toBe(false);
    });
  });

  describe('isCalibrationParam', () => {
    it('returns true for cal params', () => {
      expect(isCalibrationParam('INS_ACCOFFS_X')).toBe(true);
      expect(isCalibrationParam('COMPASS_OFS3_Z')).toBe(true);
    });

    it('returns false for non-cal params', () => {
      expect(isCalibrationParam('BATT_MONITOR')).toBe(false);
      expect(isCalibrationParam('INS_GYRO_RATE')).toBe(false);
      expect(isCalibrationParam('INS_GYROFFS_X')).toBe(false);
    });
  });

  describe('instance parsing edge cases', () => {
    it('treats COMPASS_OFS_X (no digit) as instance 1, COMPASS_OFS2_X as instance 2', () => {
      expect(categorizeCalibrationParam('COMPASS_OFS_X')?.instance).toBe(1);
      expect(categorizeCalibrationParam('COMPASS_OFS2_X')?.instance).toBe(2);
      expect(categorizeCalibrationParam('COMPASS_OFS3_X')?.instance).toBe(3);
    });

    it('does not match instance 4+', () => {
      // ArduPilot only supports IMU/compass instances 1-3. A file from a custom
      // build with INS_ACC4OFFS_X must not silently land in any bucket.
      expect(categorizeCalibrationParam('INS_ACC4OFFS_X')).toBeNull();
      expect(categorizeCalibrationParam('COMPASS_OFS4_X')).toBeNull();
    });
  });
});
