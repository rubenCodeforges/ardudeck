import { t } from '../i18n/index.js';

/**
 * Takeoff / Attitude Safety Monitor - shared types.
 *
 * A self-leveling multirotor that rests non-level demands a rotation the
 * instant it gets light. If that happens while still on the gear it can pivot
 * the craft over before liftoff: the rate integrator winds up against the
 * ground, then dumps at liftoff and fights the recovery. This monitor watches
 * the precondition pattern live and raises a graded warning BEFORE commit.
 *
 * The engine (engine.ts) is pure and source-agnostic: it consumes MonitorFrame
 * snapshots and produces a MonitorState. The same engine runs over live MAVLink
 * and over replayed .tlog frames - the only difference is who builds the frames.
 */

export type Severity = 'nominal' | 'caution' | 'danger';

/** Mirrors MAV_LANDED_STATE, normalized to the cases we care about. */
export type LandedState = 'unknown' | 'on-ground' | 'takeoff' | 'in-air';

/** MAV_LANDED_STATE enum values from EXTENDED_SYS_STATE.landedState. */
export const MAV_LANDED_STATE = {
  UNDEFINED: 0,
  ON_GROUND: 1,
  IN_AIR: 2,
  TAKEOFF: 3,
  LANDING: 4,
} as const;

export function landedStateFromMavlink(v: number | undefined): LandedState {
  switch (v) {
    case MAV_LANDED_STATE.ON_GROUND:
      return 'on-ground';
    case MAV_LANDED_STATE.TAKEOFF:
      return 'takeoff';
    case MAV_LANDED_STATE.IN_AIR:
    case MAV_LANDED_STATE.LANDING:
      return 'in-air';
    default:
      return 'unknown';
  }
}

export type SignalId =
  | 'restingAttitude'
  | 'bodyRates'
  | 'integratorLoad'
  | 'throttleClimbCoherence'
  | 'controllerFighting'
  | 'motorSpread';

/** One axis of PID_TUNING (ArduPilot units: desired/achieved in rad/s). */
export interface PidSample {
  desired: number;
  achieved: number;
  p: number;
  i: number;
  d: number;
  ff: number;
}

/**
 * A single point-in-time telemetry snapshot fed to the engine. Every field is
 * optional: the engine gracefully degrades when a stream is absent (e.g. PID
 * streaming disabled, or EXTENDED_SYS_STATE not emitted by the firmware).
 */
export interface MonitorFrame {
  /** Monotonic timestamp in milliseconds. */
  t: number;
  armed: boolean;
  landedState: LandedState;

  /** Attitude in degrees. */
  roll?: number;
  pitch?: number;
  /** Body rates in deg/s. */
  rollSpeed?: number;
  pitchSpeed?: number;

  /** Throttle output, percent 0..100. */
  throttle?: number;
  /** Climb rate, m/s (positive up). */
  climb?: number;

  /** Raw motor/servo outputs in microseconds. */
  servoOutputs?: number[];

  pidRoll?: PidSample;
  pidPitch?: PidSample;
}

/**
 * Slowly-changing context read from parameters (not per-frame telemetry).
 */
export interface MonitorContext {
  /** ATC_RAT_RLL_IMAX - max roll-rate integrator output. */
  imaxRoll?: number;
  /** ATC_RAT_PIT_IMAX - max pitch-rate integrator output. */
  imaxPitch?: number;
  /** AHRS_TRIM_X - board pitch trim, radians. */
  ahrsTrimX?: number;
  /** AHRS_TRIM_Y - board roll trim, radians. */
  ahrsTrimY?: number;
  /** True when GCS_PID_MASK has the roll+pitch bits set (PID_TUNING streaming). */
  pidStreamingAvailable: boolean;
}

export interface SignalBand {
  caution: number;
  danger: number;
}

/**
 * Per-airframe tunable thresholds. Saved as part of a per-vehicle profile.
 */
export interface MonitorProfile {
  name: string;
  /** Resting |pitch|/|roll| on ground (deg). nominal < restingNominalDeg. */
  restingNominalDeg: number;
  restingAttitudeDeg: SignalBand;
  /** On-ground |body rate| (deg/s). nominal ~0. */
  bodyRateDegS: SignalBand;
  /** Integrator load as percent of IMAX. nominal < integratorNominalPct. */
  integratorNominalPct: number;
  integratorPct: SignalBand;
  /** Throttle considered "rising/spooled" above this percent. */
  throttleRisingPct: number;
  /** |climb| below this (m/s) counts as "not lifting". */
  climbDeadbandMs: number;
  /** |rate error| (rad/s) above which controller-fighting is meaningful. */
  rateErrorThreshRadS: number;
  /** On-ground motor spread max-min (microseconds). */
  motorSpreadUs: SignalBand;
  /** Sustain time (ms) a condition must hold before the severity escalates. */
  debounceMs: number;
}

export interface SignalResult {
  id: SignalId;
  label: string;
  unit: string;
  /** Debounced severity for this signal. */
  severity: Severity;
  /** False when the underlying data is unavailable (degraded). */
  available: boolean;
  /** Reason shown when unavailable. */
  unavailableReason?: string;
  /** Current numeric value (null when unavailable). */
  value: number | null;
  /** Band edges for the deviation bar. */
  nominalMax: number;
  cautionMax: number;
  /** Extra human-readable context, e.g. tilt-not-accounted note. */
  detail?: string;
}

export type TimelineEventKind = 'danger' | 'crash' | 'disarm' | 'failsafe' | 'cleared';

export interface TimelineEvent {
  t: number;
  kind: TimelineEventKind;
  text: string;
}

export interface MonitorState {
  overall: Severity;
  /** Imperative action line shown on the banner, e.g. abort guidance. */
  action: string | null;
  signals: SignalResult[];
  /** Timestamp the compound DANGER condition latched, or null. */
  dangerLatchedAt: number | null;
  /** Integrator load as percent of IMAX, for the gauges (null = unavailable). */
  integrator: { roll: number | null; pitch: number | null };
  events: TimelineEvent[];
  /** Whether tip-over logic is currently armed (armed AND on ground/takeoff). */
  tipoverArmed: boolean;
}

export const SIGNAL_LABELS: Record<SignalId, string> = {
  restingAttitude: 'Resting attitude offset', // i18n-exempt
  bodyRates: 'Body rates on ground', // i18n-exempt
  integratorLoad: 'Integrator load', // i18n-exempt
  throttleClimbCoherence: 'Throttle vs climb', // i18n-exempt
  controllerFighting: 'Controller fighting itself', // i18n-exempt
  motorSpread: 'On-ground motor spread', // i18n-exempt
};

/** Default thresholds for a generic multirotor. */
export const DEFAULT_PROFILE: MonitorProfile = {
  name: 'Default multirotor', // i18n-exempt
  restingNominalDeg: 2,
  restingAttitudeDeg: { caution: 5, danger: 10 },
  bodyRateDegS: { caution: 15, danger: 40 },
  integratorNominalPct: 30,
  integratorPct: { caution: 60, danger: 80 },
  throttleRisingPct: 25,
  climbDeadbandMs: 0.3,
  rateErrorThreshRadS: 0.3,
  motorSpreadUs: { caution: 80, danger: 150 },
  debounceMs: 250,
};

export const ABORT_ACTION = 'REDUCE THROTTLE - abort, do not add power.';

/** A benign default state, used before the first frame arrives. */
export function emptyMonitorState(): MonitorState {
  const signals: SignalResult[] = (Object.keys(SIGNAL_LABELS) as SignalId[]).map((id) => ({
    id,
    label: t(`shared:safetyMonitor.signal.${id}`),
    unit: '',
    severity: 'nominal',
    available: true,
    value: null,
    nominalMax: 1,
    cautionMax: 2,
  }));
  return {
    overall: 'nominal',
    action: null,
    signals,
    dangerLatchedAt: null,
    integrator: { roll: null, pitch: null },
    events: [],
    tipoverArmed: false,
  };
}
