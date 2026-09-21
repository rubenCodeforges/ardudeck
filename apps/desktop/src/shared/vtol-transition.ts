/**
 * How far through a VTOL transition the aircraft actually is.
 *
 * MAVLink does not carry this. MAV_VTOL_STATE is four states with no progress,
 * so a percentage has to be derived from the conditions ArduPlane really uses
 * to end the transition, verified in ArduPlane/quadplane.cpp:
 *
 *   AIRSPEED_WAIT -> TIMER   when `aspeed > AIRSPEED_MIN`
 *   TIMER         -> DONE    after Q_TRANSITION_MS (clamped 500..30000 ms)
 *
 * So the forward transition is two stages with different meters: a speed race
 * you can watch on the airspeed, then a fixed wait. Anything else would be a
 * made-up number on a flight instrument, which is worse than showing none.
 *
 * The backward transition (to hover) has no published gate of this kind, so it
 * reports no percentage rather than a fabricated one.
 */

import { VtolState } from './telemetry-types';

/** ArduPlane clamps Q_TRANSITION_MS into this range before using it. */
export const TRANSITION_MS_MIN = 500;
export const TRANSITION_MS_MAX = 30000;

export interface TransitionInputs {
  state: VtolState | null | undefined;
  /** Indicated airspeed, m/s. */
  airspeed: number | undefined;
  /** AIRSPEED_MIN: the speed that ends the airspeed-wait stage. */
  airspeedMin: number | undefined;
  /** Q_TRANSITION_MS. */
  transitionMs: number | undefined;
  /**
   * ms since the vehicle reported reaching transition airspeed, from the
   * "Transition airspeed reached" STATUSTEXT. Undefined until it arrives.
   */
  sinceAirspeedReachedMs?: number;
}

export interface TransitionProgress {
  /** 0..1, or null when there is no honest way to compute one. */
  fraction: number | null;
  /** What the aircraft is waiting for, in the pilot's words. */
  stage: 'accelerating' | 'settling' | 'to-hover';
  /** Short label for the instrument. */
  label: string;
}

/**
 * Progress through the current transition, or null when not transitioning.
 */
export function transitionProgress(inputs: TransitionInputs): TransitionProgress | null {
  const { state, airspeed, airspeedMin, transitionMs, sinceAirspeedReachedMs } = inputs;

  if (state === VtolState.TransitionToMulticopter) {
    // ArduPlane decelerates and drops into hover without a published
    // completion gate, so report the phase and no number.
    return { fraction: null, stage: 'to-hover', label: 'TO HOVER' };
  }

  if (state !== VtolState.TransitionToFixedWing) return null;

  // Second stage: the airspeed gate is behind us and it is now a fixed wait.
  if (sinceAirspeedReachedMs !== undefined) {
    const total = clamp(transitionMs ?? 5000, TRANSITION_MS_MIN, TRANSITION_MS_MAX);
    return {
      fraction: clamp(sinceAirspeedReachedMs / total, 0, 1),
      stage: 'settling',
      label: 'TO WING',
    };
  }

  // First stage: racing the airspeed up to AIRSPEED_MIN.
  if (airspeed === undefined || !(airspeedMin !== undefined && airspeedMin > 0)) {
    return { fraction: null, stage: 'accelerating', label: 'TO WING' };
  }
  return {
    fraction: clamp(airspeed / airspeedMin, 0, 1),
    stage: 'accelerating',
    label: 'TO WING',
  };
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** Matches ArduPlane's "Transition airspeed reached 12.3" status text. */
export function isAirspeedReachedText(text: string): boolean {
  return /transition airspeed reached/i.test(text);
}
