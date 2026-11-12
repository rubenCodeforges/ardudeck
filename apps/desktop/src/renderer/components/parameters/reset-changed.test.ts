import { describe, expect, it } from 'vitest';
import { isKeptOnReset, planResetChanged } from './reset-changed';

describe('isKeptOnReset', () => {
  it.each([
    'INS_ACCOFFS_X', 'INS_ACC2SCAL_Z', 'INS_GYROFFS_Y', 'INS_ACC_ID', 'COMPASS_OFS2_X', 'COMPASS_DEV_ID3', 'COMPASS_PRIO1_ID',
    'RC3_MIN', 'RC1_TRIM', 'AHRS_TRIM_X', 'BARO1_GND_PRESS', 'SYSID_THISMAV', 'FORMAT_VERSION', 'FRAME_CLASS',
    'SERIAL2_BAUD', 'SERIAL1_PROTOCOL', 'GPS1_DEV_ID', 'CAL_ACC0_XOFF', 'CAL_MAG1_ID', 'SYS_AUTOSTART', 'MAV_SYS_ID',
    'SER_TEL1_BAUD', 'MAV_0_CONFIG', 'GPS_1_CONFIG',
  ])('keeps %s', (id) => expect(isKeptOnReset(id)).toBe(true));

  it.each(['ATC_RAT_RLL_P', 'WPNAV_SPEED', 'BATT_CAPACITY', 'RC3_OPTION', 'MC_ROLLRATE_P', 'MPC_XY_VEL_MAX', 'SERVO1_FUNCTION'])(
    'resets %s', (id) => expect(isKeptOnReset(id)).toBe(false),
  );
});

describe('planResetChanged', () => {
  const params = [
    { id: 'ATC_RAT_RLL_P', value: 0.2, defaultValue: 0.135 },
    { id: 'WPNAV_SPEED', value: 1000, defaultValue: 1000 },
    { id: 'INS_ACCOFFS_X', value: 0.1, defaultValue: 0 },
    { id: 'STAT_RUNTIME', value: 99, defaultValue: 0, isReadOnly: true },
    { id: 'NO_DEFAULT', value: 3 },
    { id: 'PSC_ACCZ_P', value: Math.fround(0.3), defaultValue: 0.3 },
  ];

  it('keeps protected values apart', () => {
    const plan = planResetChanged(params, true);
    expect(plan.reset.map((p) => p.id)).toEqual(['ATC_RAT_RLL_P']);
    expect(plan.kept.map((p) => p.id)).toEqual(['INS_ACCOFFS_X']);
  });

  it('resets everything changed when nothing is kept', () => {
    const plan = planResetChanged(params, false);
    expect(plan.reset.map((p) => p.id)).toEqual(['ATC_RAT_RLL_P', 'INS_ACCOFFS_X']);
    expect(plan.kept).toEqual([]);
  });
});
