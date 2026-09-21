import { describe, it, expect } from 'vitest';
import { isCalibrationParam } from './calibration-params';
import { formatParamFile, parseParamFile } from './param-file';

describe('calibration param classification', () => {
  it('flags per-unit calibration params', () => {
    const cal = [
      'COMPASS_OFS_X', 'COMPASS_OFS2_Y', 'COMPASS_DIA_Z', 'COMPASS_ODI2_X',
      'COMPASS_MOT_X', 'COMPASS_SCALE', 'COMPASS_SCALE2', 'COMPASS_DEV_ID', 'COMPASS_DEV_ID3',
      'COMPASS_PRIO1_ID',
      'INS_ACCOFFS_X', 'INS_ACC2OFFS_Z', 'INS_ACCSCAL_Y', 'INS_ACC3SCAL_X',
      'INS_GYROFFS_X', 'INS_GYR2OFFS_Y', 'INS_TCAL1_TMIN',
      'AHRS_TRIM_X', 'BARO1_GND_PRESS', 'BARO_GND_PRESS', 'BARO_ALT_OFFSET',
      'ARSPD_OFFSET', 'ARSPD2_RATIO',
      'BATT_VOLT_MULT', 'BATT2_AMP_PERVLT', 'BATT_AMP_OFFSET',
      'RC1_MIN', 'RC16_MAX', 'RC3_TRIM',
      'MOT_THST_HOVER', 'Q_M_THST_HOVER',
      'GND_ABS_PRESS_DEV_ID', 'INS_ACC_ID', 'BARO1_DEVID',
      'SYSID_THISMAV', 'STAT_FLTTIME', 'STAT_BOOTCNT',
    ];
    for (const p of cal) {
      expect(isCalibrationParam(p), p).toBe(true);
    }
  });

  it('flags PX4 per-unit calibration params', () => {
    const cal = [
      'CAL_ACC0_XOFF', 'CAL_ACC1_ZSCALE', 'CAL_ACC0_ID', 'CAL_ACC0_PRIO', 'CAL_ACC0_ROT',
      'CAL_GYRO0_XOFF', 'CAL_GYRO2_ID',
      'CAL_MAG0_XOFF', 'CAL_MAG0_YSCALE', 'CAL_MAG1_ZODIAG', 'CAL_MAG0_XCOMP',
      'CAL_MAG0_ID', 'CAL_MAG0_PRIO', 'CAL_MAG0_ROT', 'CAL_MAG0_ROLL', 'CAL_MAG0_YAW',
      'CAL_MAG_SIDES', 'CAL_AIR_TUBELEN',
      'SENS_BOARD_ROT', 'SENS_BOARD_X_OFF',
      'ASPD_SCALE_1', 'BAT1_V_DIV', 'BAT2_A_PER_V',
      'RC1_REV', 'MAV_SYS_ID', 'COM_FLIGHT_UUID',
    ];
    for (const p of cal) {
      expect(isCalibrationParam(p), p).toBe(true);
    }
  });

  it('does not flag portable PX4 config params', () => {
    const config = [
      'MC_ROLLRATE_P', 'MPC_XY_VEL_MAX', 'COM_ARM_WO_GPS', 'COM_ARM_MAG_STR',
      'NAV_RCL_ACT', 'NAV_DLL_ACT', 'GF_ACTION', 'SDLOG_MODE', 'SDLOG_PROFILE',
      'EKF2_MAG_TYPE', 'EKF2_GPS_POS_X', 'CBRK_BUZZER', 'CBRK_IO_SAFETY',
      'MAV_0_RATE', 'MAV_0_MODE', 'SYS_RGB_MAXBRT', 'CAL_MAG_ROT_AUTO',
      'BAT1_N_CELLS', 'ASPD_PRIMARY', 'RC_MAP_ROLL',
    ];
    for (const p of config) {
      expect(isCalibrationParam(p), p).toBe(false);
    }
  });

  it('does not flag portable config params', () => {
    const config = [
      'ATC_RAT_RLL_P', 'MOT_SPIN_MIN', 'MOT_PWM_TYPE', 'BATT_LOW_VOLT',
      'RTL_ALT', 'WPNAV_SPEED', 'FLTMODE1', 'RC5_OPTION', 'RC1_DZ', 'RC2_REVERSED',
      'COMPASS_DEC', 'COMPASS_USE', 'INS_GYRO_FILTER', 'ARMING_CHECK',
      'FENCE_ENABLE', 'LOG_BITMASK', 'SERIAL1_PROTOCOL', 'SCR_ENABLE',
      'BATT_CAPACITY', 'MOT_BAT_VOLT_MAX', 'STAT2X',
    ];
    for (const p of config) {
      expect(isCalibrationParam(p), p).toBe(false);
    }
  });
});

describe('param file format', () => {
  it('round-trips params through format + parse', () => {
    const params = [
      { id: 'WPNAV_SPEED', value: 500 },
      { id: 'ATC_RAT_RLL_P', value: 0.135 },
      { id: 'MOT_THST_HOVER', value: 0.2124878 },
    ];
    const text = formatParamFile(params, { Board: 'MatekH743', Vehicle: 'copter' });
    const parsed = parseParamFile(text);
    expect(parsed).toHaveLength(3);
    const byId = new Map(parsed.map((p) => [p.id, p.value]));
    expect(byId.get('WPNAV_SPEED')).toBe(500);
    expect(byId.get('ATC_RAT_RLL_P')).toBeCloseTo(0.135, 6);
    expect(byId.get('MOT_THST_HOVER')).toBeCloseTo(0.2124878, 6);
  });

  it('parses Mission Planner style files with comments and mixed separators', () => {
    const text = [
      '# saved by Mission Planner',
      'WPNAV_SPEED,500',
      'RTL_ALT\t1500',
      'ATC_ANG_RLL_P 4.5',
      '',
      '# trailing comment',
    ].join('\n');
    const parsed = parseParamFile(text);
    expect(parsed.map((p) => p.id)).toEqual(['WPNAV_SPEED', 'RTL_ALT', 'ATC_ANG_RLL_P']);
  });

  it('emits sorted, stable output for clean git diffs', () => {
    const a = formatParamFile(
      [{ id: 'B_PARAM', value: 1 }, { id: 'A_PARAM', value: 2 }],
      { Board: 'x' },
    );
    const b = formatParamFile(
      [{ id: 'A_PARAM', value: 2 }, { id: 'B_PARAM', value: 1 }],
      { Board: 'x' },
    );
    expect(a).toBe(b);
    expect(a.indexOf('A_PARAM')).toBeLessThan(a.indexOf('B_PARAM'));
  });
});
