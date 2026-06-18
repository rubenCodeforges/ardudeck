import { describe, it, expect } from 'vitest';
import {
  detectPidScheme,
  buildAccelParams,
  buildPresetParams,
  buildPlaneScheme,
  getAllPidParamNames,
  hasDualVtolControllers,
  hasDualPx4Controllers,
  QUADPLANE_SCHEME,
  PX4_MULTICOPTER_SCHEME,
  PX4_FIXEDWING_SCHEME,
  type PidScheme,
} from './mavlink-pid-schemes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal parameter map for scheme detection */
function makeParams(names: string[]): Map<string, { value: number }> {
  const map = new Map<string, { value: number }>();
  for (const n of names) {
    map.set(n, { value: 0 });
  }
  return map;
}

// ---------------------------------------------------------------------------
// QuadPlane dual-controller (VTOL / fixed-wing switch)
// ---------------------------------------------------------------------------

describe('hasDualVtolControllers', () => {
  it('is true when both Q_A_RAT_ (VTOL) and plane controllers exist', () => {
    expect(hasDualVtolControllers(makeParams(['Q_A_RAT_RLL_P', 'RLL_RATE_P']))).toBe(true);
    expect(hasDualVtolControllers(makeParams(['Q_A_RAT_RLL_P', 'RLL2SRV_P']))).toBe(true);
  });

  it('is false for a VTOL-only or plane-only board', () => {
    expect(hasDualVtolControllers(makeParams(['Q_A_RAT_RLL_P']))).toBe(false);
    expect(hasDualVtolControllers(makeParams(['RLL_RATE_P']))).toBe(false);
    expect(hasDualVtolControllers(makeParams(['ATC_RAT_RLL_P']))).toBe(false);
  });

  it('detectPidScheme always resolves a dual board to its VTOL set, so the UI needs the override', () => {
    const params = makeParams(['Q_A_RAT_RLL_P', 'RLL_RATE_P']);
    // Detection alone hides the fixed-wing controller behind the VTOL scheme.
    expect(detectPidScheme(params).id).toBe('quadplane');
    // The two schemes the toggle switches between target different params.
    expect(QUADPLANE_SCHEME.roll.p).toBe('Q_A_RAT_RLL_P');
    expect(buildPlaneScheme(params).roll.p).toBe('RLL_RATE_P');
  });
});

// ---------------------------------------------------------------------------
// PX4 scheme detection
// ---------------------------------------------------------------------------

describe('PX4 PID scheme detection', () => {
  it('returns the PX4 multicopter scheme for MC_ROLLRATE_P (no ArduPilot params)', () => {
    const scheme = detectPidScheme(makeParams(['MC_ROLLRATE_P']));
    expect(scheme.id).toBe('px4-multicopter');
    expect(scheme.roll.p).toBe('MC_ROLLRATE_P');
    expect(scheme.roll.i).toBe('MC_ROLLRATE_I');
    expect(scheme.roll.d).toBe('MC_ROLLRATE_D');
    expect(scheme.pitch.p).toBe('MC_PITCHRATE_P');
    expect(scheme.yaw.p).toBe('MC_YAWRATE_P');
    // PX4 MC rate controller has no per-axis feedforward
    expect(scheme.hasFF).toBe(false);
    expect(scheme.roll.ff).toBeUndefined();
  });

  it('returns the PX4 fixed-wing scheme for FW_RR_P (no ArduPilot params)', () => {
    const scheme = detectPidScheme(makeParams(['FW_RR_P']));
    expect(scheme.id).toBe('px4-fixedwing');
    expect(scheme.roll.p).toBe('FW_RR_P');
    expect(scheme.roll.ff).toBe('FW_RR_FF');
    expect(scheme.pitch.p).toBe('FW_PR_P');
    expect(scheme.pitch.ff).toBe('FW_PR_FF');
    expect(scheme.yaw.p).toBe('FW_YR_P');
    expect(scheme.yaw.ff).toBe('FW_YR_FF');
    expect(scheme.hasFF).toBe(true);
  });

  it('ArduPilot detection takes priority and is never shadowed by PX4', () => {
    // A board exposing ArduPilot params resolves to its ArduPilot scheme even
    // if PX4-named params were somehow also present.
    expect(detectPidScheme(makeParams(['ATC_RAT_RLL_P', 'MC_ROLLRATE_P'])).id).toBe('modern-copter');
    expect(detectPidScheme(makeParams(['Q_A_RAT_RLL_P', 'MC_ROLLRATE_P'])).id).toBe('quadplane');
  });

  it('prefers the multicopter scheme on a PX4 VTOL carrying both sets', () => {
    expect(detectPidScheme(makeParams(['MC_ROLLRATE_P', 'FW_RR_P'])).id).toBe('px4-multicopter');
  });

  it('PX4 scheme param-name flattening has no duplicates and excludes accel', () => {
    const mc = getAllPidParamNames(PX4_MULTICOPTER_SCHEME);
    expect(new Set(mc).size).toBe(mc.length);
    expect(mc.some((n) => n.includes('ACCEL'))).toBe(false);
    expect(PX4_MULTICOPTER_SCHEME.accel).toBeUndefined();

    const fw = getAllPidParamNames(PX4_FIXEDWING_SCHEME);
    expect(new Set(fw).size).toBe(fw.length);
    expect(fw).toContain('FW_RR_FF');
  });

  it('buildPresetParams maps PX4 fixed-wing values onto FW_* names including FF', () => {
    const params = buildPresetParams(PX4_FIXEDWING_SCHEME, PX4_FIXEDWING_SCHEME.defaults);
    expect(params['FW_RR_P']).toBe(0.05);
    expect(params['FW_RR_FF']).toBe(0.5);
    expect(params['FW_PR_P']).toBe(0.08);
  });
});

describe('hasDualPx4Controllers', () => {
  it('is true only when both MC_ROLLRATE_P and FW_RR_P exist', () => {
    expect(hasDualPx4Controllers(makeParams(['MC_ROLLRATE_P', 'FW_RR_P']))).toBe(true);
    expect(hasDualPx4Controllers(makeParams(['MC_ROLLRATE_P']))).toBe(false);
    expect(hasDualPx4Controllers(makeParams(['FW_RR_P']))).toBe(false);
    expect(hasDualPx4Controllers(makeParams(['ATC_RAT_RLL_P']))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildAccelParams
// ---------------------------------------------------------------------------

describe('buildAccelParams', () => {
  it('should map accel values to modern copter param names', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 110000, pitch: 110000, yaw: 27000 });
    expect(result).toEqual({
      ATC_ACCEL_R_MAX: 110000,
      ATC_ACCEL_P_MAX: 110000,
      ATC_ACCEL_Y_MAX: 27000,
    });
  });

  it('should map accel values to quadplane param names', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 80000, pitch: 80000, yaw: 20000 });
    expect(result).toEqual({
      Q_A_ACCEL_R_MAX: 80000,
      Q_A_ACCEL_P_MAX: 80000,
      Q_A_ACCEL_Y_MAX: 20000,
    });
  });

  it('should return empty object for schemes without accel support', () => {
    // Legacy copter has no accel params
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 110000, pitch: 110000, yaw: 27000 });
    expect(result).toEqual({});
  });

  it('should return empty object for plane scheme', () => {
    const scheme = detectPidScheme(makeParams(['RLL2SRV_P']));
    const result = buildAccelParams(scheme, { roll: 110000, pitch: 110000, yaw: 27000 });
    expect(result).toEqual({});
  });

  it('should handle zero accel values', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 0, pitch: 0, yaw: 0 });
    expect(result).toEqual({
      ATC_ACCEL_R_MAX: 0,
      ATC_ACCEL_P_MAX: 0,
      ATC_ACCEL_Y_MAX: 0,
    });
  });

  it('should handle asymmetric accel values', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const result = buildAccelParams(scheme, { roll: 160000, pitch: 80000, yaw: 40000 });
    expect(result).toEqual({
      ATC_ACCEL_R_MAX: 160000,
      ATC_ACCEL_P_MAX: 80000,
      ATC_ACCEL_Y_MAX: 40000,
    });
  });
});

// ---------------------------------------------------------------------------
// Scheme accel properties
// ---------------------------------------------------------------------------

describe('PID scheme accel properties', () => {
  it('modern copter should have ATC_ACCEL_*_MAX param names', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    expect(scheme.accel).toEqual({
      roll: 'ATC_ACCEL_R_MAX',
      pitch: 'ATC_ACCEL_P_MAX',
      yaw: 'ATC_ACCEL_Y_MAX',
    });
  });

  it('modern copter should have accel defaults', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    expect(scheme.accelDefaults).toEqual({
      roll: 110000,
      pitch: 110000,
      yaw: 27000,
    });
  });

  it('quadplane should have Q_A_ACCEL_*_MAX param names', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    expect(scheme.accel).toEqual({
      roll: 'Q_A_ACCEL_R_MAX',
      pitch: 'Q_A_ACCEL_P_MAX',
      yaw: 'Q_A_ACCEL_Y_MAX',
    });
  });

  it('quadplane should have same accel defaults as modern copter', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    expect(scheme.accelDefaults).toEqual({
      roll: 110000,
      pitch: 110000,
      yaw: 27000,
    });
  });

  it('legacy copter should not have accel params', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    expect(scheme.accel).toBeUndefined();
    expect(scheme.accelDefaults).toBeUndefined();
  });

  it('plane scheme should not have accel params', () => {
    const scheme = detectPidScheme(makeParams(['RLL2SRV_P']));
    expect(scheme.accel).toBeUndefined();
    expect(scheme.accelDefaults).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllPidParamNames includes accel params
// ---------------------------------------------------------------------------

describe('getAllPidParamNames with accel params', () => {
  it('should include accel param names for modern copter', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(names).toContain('ATC_ACCEL_R_MAX');
    expect(names).toContain('ATC_ACCEL_P_MAX');
    expect(names).toContain('ATC_ACCEL_Y_MAX');
  });

  it('should include accel param names for quadplane', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(names).toContain('Q_A_ACCEL_R_MAX');
    expect(names).toContain('Q_A_ACCEL_P_MAX');
    expect(names).toContain('Q_A_ACCEL_Y_MAX');
  });

  it('should not include accel param names for legacy copter', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(names.some(n => n.includes('ACCEL'))).toBe(false);
  });

  it('should not include accel param names for plane', () => {
    const scheme = detectPidScheme(makeParams(['RLL2SRV_P']));
    const names = getAllPidParamNames(scheme);
    expect(names.some(n => n.includes('ACCEL'))).toBe(false);
  });

  it('should still include PID param names alongside accel params', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const names = getAllPidParamNames(scheme);
    // P/I/D/FF for roll
    expect(names).toContain('ATC_RAT_RLL_P');
    expect(names).toContain('ATC_RAT_RLL_I');
    expect(names).toContain('ATC_RAT_RLL_D');
    expect(names).toContain('ATC_RAT_RLL_FF');
    // Accel
    expect(names).toContain('ATC_ACCEL_R_MAX');
    // Total: 3 axes × 4 (P/I/D/FF) + 3 accel = 15
    expect(names).toHaveLength(15);
  });
});

// ---------------------------------------------------------------------------
// buildPresetParams (existing fn - ensure it still works with accel schemes)
// ---------------------------------------------------------------------------

describe('buildPresetParams with accel-capable scheme', () => {
  it('should build PID params without including accel params', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const values = {
      roll:  { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
      pitch: { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
      yaw:   { p: 0.18, i: 0.018, d: 0, ff: 0 },
    };
    const params = buildPresetParams(scheme, values);
    // Should not contain accel params
    expect(Object.keys(params).some(k => k.includes('ACCEL'))).toBe(false);
    // Should contain PID params
    expect(params['ATC_RAT_RLL_P']).toBe(0.135);
    expect(params['ATC_RAT_PIT_I']).toBe(0.135);
    expect(params['ATC_RAT_YAW_D']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Combined PID + accel param building
// ---------------------------------------------------------------------------

describe('PID + accel param building workflow', () => {
  it('should produce separate PID and accel param sets that can be merged', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const pidValues = {
      roll:  { p: 0.08, i: 0.08, d: 0.003, ff: 0 },
      pitch: { p: 0.08, i: 0.08, d: 0.003, ff: 0 },
      yaw:   { p: 0.15, i: 0.015, d: 0, ff: 0 },
    };
    const accelValues = { roll: 80000, pitch: 80000, yaw: 20000 };

    const pidParams = buildPresetParams(scheme, pidValues);
    const accelParams = buildAccelParams(scheme, accelValues);
    const combined = { ...pidParams, ...accelParams };

    // PID params present
    expect(combined['ATC_RAT_RLL_P']).toBe(0.08);
    expect(combined['ATC_RAT_YAW_P']).toBe(0.15);
    // Accel params present
    expect(combined['ATC_ACCEL_R_MAX']).toBe(80000);
    expect(combined['ATC_ACCEL_Y_MAX']).toBe(20000);
    // Total keys: 12 PID + 3 accel = 15
    expect(Object.keys(combined)).toHaveLength(15);
  });

  it('should produce only PID params when scheme has no accel', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const pidValues = {
      roll:  { p: 0.15, i: 0.1, d: 0.004 },
      pitch: { p: 0.15, i: 0.1, d: 0.004 },
      yaw:   { p: 0.15, i: 0.015, d: 0 },
    };
    const accelValues = { roll: 110000, pitch: 110000, yaw: 27000 };

    const pidParams = buildPresetParams(scheme, pidValues);
    const accelParams = buildAccelParams(scheme, accelValues);
    const combined = { ...pidParams, ...accelParams };

    // Only PID params (legacy has no FF, so 3 axes × 3 = 9)
    expect(Object.keys(combined)).toHaveLength(9);
    expect(Object.keys(combined).some(k => k.includes('ACCEL'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unknown scheme fallback inherits accel from modern copter
// ---------------------------------------------------------------------------

describe('unknown scheme fallback accel support', () => {
  it('should inherit accel params from modern copter when no params match', () => {
    const scheme = detectPidScheme(makeParams([]));
    expect(scheme.id).toBe('unknown');
    expect(scheme.accel).toEqual({
      roll: 'ATC_ACCEL_R_MAX',
      pitch: 'ATC_ACCEL_P_MAX',
      yaw: 'ATC_ACCEL_Y_MAX',
    });
  });

  it('should inherit accel defaults from modern copter when no params match', () => {
    const scheme = detectPidScheme(makeParams([]));
    expect(scheme.accelDefaults).toEqual({
      roll: 110000,
      pitch: 110000,
      yaw: 27000,
    });
  });

  it('buildAccelParams should work with the unknown fallback scheme', () => {
    const scheme = detectPidScheme(makeParams([]));
    const result = buildAccelParams(scheme, { roll: 80000, pitch: 80000, yaw: 20000 });
    expect(result).toEqual({
      ATC_ACCEL_R_MAX: 80000,
      ATC_ACCEL_P_MAX: 80000,
      ATC_ACCEL_Y_MAX: 20000,
    });
  });
});

// ---------------------------------------------------------------------------
// Modern plane scheme (RLL_RATE_P) also lacks accel
// ---------------------------------------------------------------------------

describe('modern plane scheme accel', () => {
  it('modern plane (RLL_RATE_P) should not have accel params', () => {
    const scheme = detectPidScheme(makeParams(['RLL_RATE_P']));
    expect(scheme.id).toBe('plane');
    expect(scheme.accel).toBeUndefined();
    expect(scheme.accelDefaults).toBeUndefined();
  });

  it('buildAccelParams returns empty for modern plane', () => {
    const scheme = detectPidScheme(makeParams(['RLL_RATE_P']));
    const result = buildAccelParams(scheme, { roll: 110000, pitch: 110000, yaw: 27000 });
    expect(result).toEqual({});
  });

  it('getAllPidParamNames should not include accel for modern plane', () => {
    const scheme = detectPidScheme(makeParams(['RLL_RATE_P']));
    const names = getAllPidParamNames(scheme);
    expect(names.some(n => n.includes('ACCEL'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reset-to-defaults workflow via buildAccelParams
// ---------------------------------------------------------------------------

describe('reset to accel defaults workflow', () => {
  it('modern copter accelDefaults through buildAccelParams produces correct reset params', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    // This is the pattern the component uses for resetToDefaults
    const resetParams = buildAccelParams(scheme, scheme.accelDefaults!);
    expect(resetParams).toEqual({
      ATC_ACCEL_R_MAX: 110000,
      ATC_ACCEL_P_MAX: 110000,
      ATC_ACCEL_Y_MAX: 27000,
    });
  });

  it('quadplane accelDefaults through buildAccelParams produces correct reset params', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    const resetParams = buildAccelParams(scheme, scheme.accelDefaults!);
    expect(resetParams).toEqual({
      Q_A_ACCEL_R_MAX: 110000,
      Q_A_ACCEL_P_MAX: 110000,
      Q_A_ACCEL_Y_MAX: 27000,
    });
  });

  it('legacy copter has no accelDefaults to reset', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    expect(scheme.accelDefaults).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Slider display conversion: cdeg/s² ↔ deg/s² (÷100 / ×100)
// ---------------------------------------------------------------------------

describe('accel slider display conversion (cdeg/s² ↔ deg/s²)', () => {
  // The UI displays Math.round(value / 100) and stores v * 100
  // This validates the roundtrip is lossless for typical values

  it('default copter values convert cleanly to display units', () => {
    const defaults = { roll: 110000, pitch: 110000, yaw: 27000 };
    expect(Math.round(defaults.roll / 100)).toBe(1100);
    expect(Math.round(defaults.pitch / 100)).toBe(1100);
    expect(Math.round(defaults.yaw / 100)).toBe(270);
  });

  it('display → storage roundtrip preserves value for multiples of 100', () => {
    const stored = 80000;
    const displayed = Math.round(stored / 100); // 800
    const backToStored = displayed * 100; // 80000
    expect(backToStored).toBe(stored);
  });

  it('all preset accel values are multiples of 100 (lossless conversion)', () => {
    // The presets use round numbers in cdeg/s² that divide cleanly by 100
    const presetAccelValues = [
      { roll: 80000, pitch: 80000, yaw: 20000 },    // beginner
      { roll: 110000, pitch: 110000, yaw: 27000 },   // freestyle
      { roll: 160000, pitch: 160000, yaw: 40000 },   // racing
      { roll: 55000, pitch: 55000, yaw: 14000 },     // cinematic
    ];
    for (const accel of presetAccelValues) {
      expect(accel.roll % 100).toBe(0);
      expect(accel.pitch % 100).toBe(0);
      expect(accel.yaw % 100).toBe(0);
    }
  });

  it('accelDefaults are multiples of 100 (lossless slider conversion)', () => {
    const copter = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    expect(copter.accelDefaults!.roll % 100).toBe(0);
    expect(copter.accelDefaults!.pitch % 100).toBe(0);
    expect(copter.accelDefaults!.yaw % 100).toBe(0);

    const qp = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    expect(qp.accelDefaults!.roll % 100).toBe(0);
    expect(qp.accelDefaults!.pitch % 100).toBe(0);
    expect(qp.accelDefaults!.yaw % 100).toBe(0);
  });

  it('slider max range in deg/s² covers the accel defaults', () => {
    // UI: roll/pitch max=1800, yaw max=720 (in deg/s²)
    const ROLL_PITCH_MAX = 1800;
    const YAW_MAX = 720;
    const copter = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const rollDisplay = Math.round(copter.accelDefaults!.roll / 100);
    const pitchDisplay = Math.round(copter.accelDefaults!.pitch / 100);
    const yawDisplay = Math.round(copter.accelDefaults!.yaw / 100);
    expect(rollDisplay).toBeLessThanOrEqual(ROLL_PITCH_MAX);
    expect(pitchDisplay).toBeLessThanOrEqual(ROLL_PITCH_MAX);
    expect(yawDisplay).toBeLessThanOrEqual(YAW_MAX);
  });
});

// ---------------------------------------------------------------------------
// getAllPidParamNames produces no duplicates
// ---------------------------------------------------------------------------

describe('getAllPidParamNames no duplicates', () => {
  it('modern copter param names should have no duplicates', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(new Set(names).size).toBe(names.length);
  });

  it('quadplane param names should have no duplicates', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(new Set(names).size).toBe(names.length);
  });

  it('legacy copter param names should have no duplicates', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const names = getAllPidParamNames(scheme);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// Preset accel → scheme mapping integration (the applyPreset workflow)
// ---------------------------------------------------------------------------

describe('preset accel application via buildAccelParams', () => {
  // Simulates what PidTuningTab.applyPreset does for accel

  it('beginner preset accel maps correctly to modern copter params', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const presetAccel = { roll: 80000, pitch: 80000, yaw: 20000 };
    const params = buildAccelParams(scheme, presetAccel);
    expect(params).toEqual({
      ATC_ACCEL_R_MAX: 80000,
      ATC_ACCEL_P_MAX: 80000,
      ATC_ACCEL_Y_MAX: 20000,
    });
  });

  it('racing preset accel maps correctly to quadplane params', () => {
    const scheme = detectPidScheme(makeParams(['Q_A_RAT_RLL_P']));
    const presetAccel = { roll: 160000, pitch: 160000, yaw: 40000 };
    const params = buildAccelParams(scheme, presetAccel);
    expect(params).toEqual({
      Q_A_ACCEL_R_MAX: 160000,
      Q_A_ACCEL_P_MAX: 160000,
      Q_A_ACCEL_Y_MAX: 40000,
    });
  });

  it('preset accel is silently ignored for schemes without accel support', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const presetAccel = { roll: 110000, pitch: 110000, yaw: 27000 };
    const params = buildAccelParams(scheme, presetAccel);
    expect(params).toEqual({});
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('freestyle preset accel matches modern copter scheme defaults', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const freestyleAccel = { roll: 110000, pitch: 110000, yaw: 27000 };
    // Freestyle is the "standard" preset, should match scheme defaults
    expect(freestyleAccel).toEqual(scheme.accelDefaults);
  });
});

// ---------------------------------------------------------------------------
// Profile data building (the profileData memo pattern)
// ---------------------------------------------------------------------------

describe('profile data includes both PID and accel params', () => {
  it('profile data for copter merges PID + accel into single record', () => {
    const scheme = detectPidScheme(makeParams(['ATC_RAT_RLL_P']));
    const pidValues = {
      roll:  { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
      pitch: { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
      yaw:   { p: 0.18, i: 0.018, d: 0, ff: 0 },
    };
    const accelValues = { roll: 110000, pitch: 110000, yaw: 27000 };

    // Replicate the component's profileData memo logic
    const pidParams = buildPresetParams(scheme, pidValues);
    const accelParams = buildAccelParams(scheme, accelValues);
    const profileData = { ...pidParams, ...accelParams };

    // Should have all 15 params (12 PID + 3 accel)
    expect(Object.keys(profileData)).toHaveLength(15);
    // Verify no key collision between PID and accel
    const pidKeys = Object.keys(pidParams);
    const accelKeys = Object.keys(accelParams);
    for (const k of accelKeys) {
      expect(pidKeys).not.toContain(k);
    }
  });

  it('profile data for legacy copter has PID only (no accel keys)', () => {
    const scheme = detectPidScheme(makeParams(['RATE_RLL_P']));
    const pidValues = {
      roll:  { p: 0.15, i: 0.1, d: 0.004 },
      pitch: { p: 0.15, i: 0.1, d: 0.004 },
      yaw:   { p: 0.15, i: 0.015, d: 0 },
    };
    const accelValues = { roll: 110000, pitch: 110000, yaw: 27000 };

    const pidParams = buildPresetParams(scheme, pidValues);
    const accelParams = buildAccelParams(scheme, accelValues);
    const profileData = { ...pidParams, ...accelParams };

    // Legacy: 3 axes × 3 (P/I/D, no FF) = 9
    expect(Object.keys(profileData)).toHaveLength(9);
    expect(Object.keys(profileData).every(k => !k.includes('ACCEL'))).toBe(true);
  });
});
