/**
 * MAVLink PID Parameter Scheme Detection
 *
 * ArduPilot uses different parameter names depending on firmware version and vehicle type:
 * - Modern ArduCopter 3.5+: ATC_RAT_RLL_P, ATC_RAT_RLL_I, ATC_RAT_RLL_D, ATC_RAT_RLL_FF
 * - Legacy ArduCopter <3.5 (APM 2.5): RATE_RLL_P, RATE_RLL_I, RATE_RLL_D (no FF)
 * - ArduPlane 4.5+: RLL_RATE_P, RLL_RATE_I, RLL_RATE_D, RLL_RATE_FF (rate controller)
 * - ArduPlane (legacy): RLL2SRV_P, RLL2SRV_I, RLL2SRV_D (angle controller, not rate)
 * - QuadPlane VTOL: Q_A_RAT_RLL_P, Q_A_RAT_RLL_I, Q_A_RAT_RLL_D, Q_A_RAT_RLL_FF
 *
 * This module auto-detects the scheme by probing the parameter store.
 */

// ---------------------------------------------------------------------------
// PID Scheme Types
// ---------------------------------------------------------------------------

export type PidSchemeId = 'modern-copter' | 'legacy-copter' | 'plane' | 'quadplane' | 'unknown';

export interface AxisParams {
  p: string;
  i: string;
  d: string;
  ff?: string; // Legacy copter and plane don't have FF
}

export interface PidScheme {
  id: PidSchemeId;
  label: string;
  description: string;
  hasFF: boolean;
  roll: AxisParams;
  pitch: AxisParams;
  yaw: AxisParams;
  /** Slider display scale: param value * scale = slider value */
  pScale: number;
  iScale: number;
  dScale: number;
  ffScale: number;
  /** Slider max values (after scaling) */
  pMax: number;
  iMax: number;
  dMax: number;
  ffMax: number;
  /** Default PID values (real param values, not scaled) */
  defaults: {
    roll: { p: number; i: number; d: number; ff?: number };
    pitch: { p: number; i: number; d: number; ff?: number };
    yaw: { p: number; i: number; d: number; ff?: number };
  };
}

// ---------------------------------------------------------------------------
// Scheme Definitions
// ---------------------------------------------------------------------------

const MODERN_COPTER_SCHEME: PidScheme = {
  id: 'modern-copter',
  label: 'ArduCopter 3.5+',
  description: 'Modern rate controller with feedforward',
  hasFF: true,
  roll: { p: 'ATC_RAT_RLL_P', i: 'ATC_RAT_RLL_I', d: 'ATC_RAT_RLL_D', ff: 'ATC_RAT_RLL_FF' },
  pitch: { p: 'ATC_RAT_PIT_P', i: 'ATC_RAT_PIT_I', d: 'ATC_RAT_PIT_D', ff: 'ATC_RAT_PIT_FF' },
  yaw: { p: 'ATC_RAT_YAW_P', i: 'ATC_RAT_YAW_I', d: 'ATC_RAT_YAW_D', ff: 'ATC_RAT_YAW_FF' },
  pScale: 1000, iScale: 1000, dScale: 10000, ffScale: 1000,
  pMax: 500, iMax: 500, dMax: 100, ffMax: 500,
  defaults: {
    roll: { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
    pitch: { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
    yaw: { p: 0.18, i: 0.018, d: 0, ff: 0 },
  },
};

const LEGACY_COPTER_SCHEME: PidScheme = {
  id: 'legacy-copter',
  label: 'ArduCopter (Legacy)',
  description: 'Legacy rate controller (APM 2.5 / ArduCopter < 3.5)',
  hasFF: false,
  roll: { p: 'RATE_RLL_P', i: 'RATE_RLL_I', d: 'RATE_RLL_D' },
  pitch: { p: 'RATE_PIT_P', i: 'RATE_PIT_I', d: 'RATE_PIT_D' },
  yaw: { p: 'RATE_YAW_P', i: 'RATE_YAW_I', d: 'RATE_YAW_D' },
  pScale: 1000, iScale: 1000, dScale: 10000, ffScale: 1,
  pMax: 500, iMax: 500, dMax: 100, ffMax: 0,
  defaults: {
    roll: { p: 0.15, i: 0.1, d: 0.004 },
    pitch: { p: 0.15, i: 0.1, d: 0.004 },
    yaw: { p: 0.15, i: 0.015, d: 0 },
  },
};

/**
 * ArduPlane PID scheme builder.
 * Mission Planner handles both modern and legacy param names via String[] fallback arrays
 * (see ConfigArduplane.cs) — we do the same with resolvePlaneParam().
 * Modern ArduPlane 4.5+ renamed the angle-to-servo params to rate controller params:
 *   RLL2SRV_P → RLL_RATE_P,  PTCH2SRV_P → PTCH_RATE_P,  YAW2SRV_* → YAW_RATE_*
 */

/** Resolve which ArduPlane parameter name is present, preferring the modern name */
function resolvePlaneParam(parameters: Map<string, unknown>, modern: string, legacy: string): string {
  return parameters.has(modern) ? modern : legacy;
}

/** Build a plane PID scheme adapted to whichever param names exist on the board */
function buildPlaneScheme(parameters: Map<string, { value: number }>): PidScheme {
  const isModern = parameters.has('RLL_RATE_P');
  const r = (m: string, l: string) => resolvePlaneParam(parameters, m, l);

  return {
    id: 'plane',
    label: 'ArduPlane',
    description: 'Fixed-wing controller',
    hasFF: isModern,
    roll: {
      p: r('RLL_RATE_P', 'RLL2SRV_P'),
      i: r('RLL_RATE_I', 'RLL2SRV_I'),
      d: r('RLL_RATE_D', 'RLL2SRV_D'),
      ...(isModern ? { ff: 'RLL_RATE_FF' } : {}),
    },
    pitch: {
      p: r('PTCH_RATE_P', 'PTCH2SRV_P'),
      i: r('PTCH_RATE_I', 'PTCH2SRV_I'),
      d: r('PTCH_RATE_D', 'PTCH2SRV_D'),
      ...(isModern ? { ff: 'PTCH_RATE_FF' } : {}),
    },
    yaw: {
      p: r('YAW_RATE_P', 'YAW2SRV_SLIP'),
      i: r('YAW_RATE_I', 'YAW2SRV_INT'),
      d: r('YAW_RATE_D', 'YAW2SRV_DAMP'),
      ...(isModern ? { ff: 'YAW_RATE_FF' } : {}),
    },
    // Modern rate controller uses small decimals (0.08-0.35), legacy angle controller uses larger values (0-5)
    ...(isModern
      ? { pScale: 1000, iScale: 1000, dScale: 10000, ffScale: 100, pMax: 500, iMax: 1000, dMax: 500, ffMax: 500 }
      : { pScale: 100, iScale: 1000, dScale: 1000, ffScale: 1, pMax: 500, iMax: 500, dMax: 500, ffMax: 0 }),
    defaults: isModern
      ? {
          roll:  { p: 0.08, i: 0.1, d: 0.003, ff: 0.2 },
          pitch: { p: 0.08, i: 0.1, d: 0.003, ff: 0.2 },
          yaw:   { p: 0.08, i: 0.01, d: 0, ff: 0 },
        }
      : {
          roll:  { p: 0.4, i: 0.0, d: 0.0 },
          pitch: { p: 0.6, i: 0.0, d: 0.0 },
          yaw:   { p: 0.0, i: 0.0, d: 0.0 },
        },
  };
}

const QUADPLANE_SCHEME: PidScheme = {
  id: 'quadplane',
  label: 'QuadPlane VTOL',
  description: 'QuadPlane VTOL rate controller with feedforward',
  hasFF: true,
  roll: { p: 'Q_A_RAT_RLL_P', i: 'Q_A_RAT_RLL_I', d: 'Q_A_RAT_RLL_D', ff: 'Q_A_RAT_RLL_FF' },
  pitch: { p: 'Q_A_RAT_PIT_P', i: 'Q_A_RAT_PIT_I', d: 'Q_A_RAT_PIT_D', ff: 'Q_A_RAT_PIT_FF' },
  yaw: { p: 'Q_A_RAT_YAW_P', i: 'Q_A_RAT_YAW_I', d: 'Q_A_RAT_YAW_D', ff: 'Q_A_RAT_YAW_FF' },
  pScale: 1000, iScale: 1000, dScale: 10000, ffScale: 1000,
  pMax: 500, iMax: 500, dMax: 100, ffMax: 500,
  defaults: {
    roll: { p: 0.25, i: 0.25, d: 0.004, ff: 0 },
    pitch: { p: 0.25, i: 0.25, d: 0.004, ff: 0 },
    yaw: { p: 0.25, i: 0.025, d: 0, ff: 0 },
  },
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect which PID parameter scheme this board uses by probing the parameter store.
 * Checks in order of specificity: quadplane > modern copter > legacy copter > plane > unknown.
 * ArduPlane handles both modern (RLL_RATE_*) and legacy (RLL2SRV_*) naming transparently.
 */
export function detectPidScheme(parameters: Map<string, { value: number }>): PidScheme {
  if (parameters.has('Q_A_RAT_RLL_P')) return QUADPLANE_SCHEME;
  if (parameters.has('ATC_RAT_RLL_P')) return MODERN_COPTER_SCHEME;
  if (parameters.has('RATE_RLL_P')) return LEGACY_COPTER_SCHEME;
  if (parameters.has('RLL_RATE_P') || parameters.has('RLL2SRV_P')) return buildPlaneScheme(parameters);
  return { ...MODERN_COPTER_SCHEME, id: 'unknown' as PidSchemeId };
}

// ---------------------------------------------------------------------------
// Rate Scheme Types
// ---------------------------------------------------------------------------

export type RateSchemeId = 'modern-copter' | 'legacy-copter' | 'plane' | 'unknown';

export interface RateScheme {
  id: RateSchemeId;
  label: string;
  hasExpo: boolean;
  /** True if roll and pitch share the same rate param */
  rpLinked: boolean;
  rollPitch: { rate: string; expo?: string };
  /** Separate pitch params when rpLinked is false (e.g. ArduPlane ACRO_PITCH_RATE) */
  pitch?: { rate: string; expo?: string };
  yaw: { rate: string; expo?: string };
  /** Unit label for the rate value */
  rateUnit: string;
  /** Slider ranges */
  rpRateMin: number;
  rpRateMax: number;
  rpRateStep: number;
  yawRateMin: number;
  yawRateMax: number;
  yawRateStep: number;
  /** Expo is 0-1 internally, displayed as 0-100% */
  expoScale: number;
  defaults: {
    rpRate: number;
    pitchRate?: number;
    yawRate: number;
    rpExpo: number;
    yawExpo: number;
  };
}

const MODERN_RATE_SCHEME: RateScheme = {
  id: 'modern-copter',
  label: 'ArduCopter 3.5+',
  hasExpo: true,
  rpLinked: true,
  rollPitch: { rate: 'ACRO_RP_RATE', expo: 'ACRO_RP_EXPO' },
  yaw: { rate: 'ACRO_Y_RATE', expo: 'ACRO_Y_EXPO' },
  rateUnit: 'deg/s',
  rpRateMin: 45, rpRateMax: 720, rpRateStep: 5,
  yawRateMin: 30, yawRateMax: 360, yawRateStep: 5,
  expoScale: 100,
  defaults: { rpRate: 180, yawRate: 90, rpExpo: 0, yawExpo: 0 },
};

const LEGACY_RATE_SCHEME: RateScheme = {
  id: 'legacy-copter',
  label: 'ArduCopter (Legacy)',
  hasExpo: false,
  rpLinked: true,
  rollPitch: { rate: 'ACRO_RP_P' },
  yaw: { rate: 'ACRO_YAW_P' },
  rateUnit: 'x multiplier',
  rpRateMin: 1, rpRateMax: 10, rpRateStep: 0.5,
  yawRateMin: 1, yawRateMax: 10, yawRateStep: 0.5,
  expoScale: 1,
  defaults: { rpRate: 4.5, yawRate: 4.5, rpExpo: 0, yawExpo: 0 },
};

const PLANE_RATE_SCHEME: RateScheme = {
  id: 'plane',
  label: 'ArduPlane',
  hasExpo: false,
  rpLinked: false,
  rollPitch: { rate: 'ACRO_ROLL_RATE' },
  pitch: { rate: 'ACRO_PITCH_RATE' },
  yaw: { rate: 'ACRO_YAW_RATE' },
  rateUnit: 'deg/s',
  rpRateMin: 10, rpRateMax: 720, rpRateStep: 5,
  yawRateMin: 0, yawRateMax: 360, yawRateStep: 5,
  expoScale: 1,
  defaults: { rpRate: 180, pitchRate: 180, yawRate: 0, rpExpo: 0, yawExpo: 0 },
};

/**
 * Detect which rate parameter scheme this board uses.
 */
export function detectRateScheme(parameters: Map<string, { value: number }>): RateScheme {
  if (parameters.has('ACRO_RP_RATE')) return MODERN_RATE_SCHEME;
  if (parameters.has('ACRO_RP_P')) return LEGACY_RATE_SCHEME;
  if (parameters.has('ACRO_ROLL_RATE')) return PLANE_RATE_SCHEME;
  return { ...MODERN_RATE_SCHEME, id: 'unknown' as RateSchemeId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all param names for a PID scheme as a flat array */
export function getAllPidParamNames(scheme: PidScheme): string[] {
  const names: string[] = [];
  for (const axis of [scheme.roll, scheme.pitch, scheme.yaw]) {
    names.push(axis.p, axis.i, axis.d);
    if (axis.ff) names.push(axis.ff);
  }
  return names;
}

/** Get all param names for a rate scheme as a flat array */
export function getAllRateParamNames(scheme: RateScheme): string[] {
  const names: string[] = [];
  names.push(scheme.rollPitch.rate);
  if (scheme.rollPitch.expo) names.push(scheme.rollPitch.expo);
  if (scheme.pitch) {
    names.push(scheme.pitch.rate);
    if (scheme.pitch.expo) names.push(scheme.pitch.expo);
  }
  names.push(scheme.yaw.rate);
  if (scheme.yaw.expo) names.push(scheme.yaw.expo);
  return names;
}

/**
 * Build a PID preset params object mapped to the active scheme's parameter names.
 * Takes abstract PID values and returns { [actualParamName]: value } for the scheme.
 */
export function buildPresetParams(
  scheme: PidScheme,
  values: {
    roll: { p: number; i: number; d: number; ff?: number };
    pitch: { p: number; i: number; d: number; ff?: number };
    yaw: { p: number; i: number; d: number; ff?: number };
  },
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const axisKey of ['roll', 'pitch', 'yaw'] as const) {
    const axis = scheme[axisKey];
    const vals = values[axisKey];
    params[axis.p] = vals.p;
    params[axis.i] = vals.i;
    params[axis.d] = vals.d;
    if (axis.ff && vals.ff !== undefined) {
      params[axis.ff] = vals.ff;
    }
  }
  return params;
}

/**
 * Build a rate preset params object mapped to the active scheme's parameter names.
 */
export function buildRatePresetParams(
  scheme: RateScheme,
  values: { rpRate: number; pitchRate?: number; yawRate: number; rpExpo?: number; yawExpo?: number },
): Record<string, number> {
  const params: Record<string, number> = {};
  params[scheme.rollPitch.rate] = values.rpRate;
  if (scheme.pitch) {
    params[scheme.pitch.rate] = values.pitchRate ?? values.rpRate;
  }
  params[scheme.yaw.rate] = values.yawRate;
  if (scheme.rollPitch.expo && values.rpExpo !== undefined) {
    params[scheme.rollPitch.expo] = values.rpExpo;
  }
  if (scheme.yaw.expo && values.yawExpo !== undefined) {
    params[scheme.yaw.expo] = values.yawExpo;
  }
  return params;
}
