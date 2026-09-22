/**
 * The turn the aircraft can actually make, which the plan is built around.
 *
 * Overshoot used to be a number the pilot typed that appended a waypoint past
 * each strip end. It is not an independent setting: the room a reversal needs
 * follows from the level-turn radius, r = v² / (g·tan φ), and the gap between
 * the lines. Deriving it lets the generator order the strips so the turns fit,
 * instead of padding every end with a waypoint that fixes nothing.
 */

import type { SurveyConfig } from '../survey-types';

/** Bank a survey is planned around unless the config says otherwise. */
export const DEFAULT_PLAN_BANK_DEG = 30;

/** Level-turn radius: r = v² / (g·tan φ). */
export function turnRadiusFor(speedMs: number, bankDeg = DEFAULT_PLAN_BANK_DEG): number {
  const v = Math.max(1, speedMs);
  const bank = Math.min(60, Math.max(5, bankDeg));
  return (v * v) / (9.81 * Math.tan((bank * Math.PI) / 180));
}

/** ArduPlane's AIRSPEED_CRUISE default, used when no vehicle has told us. */
export const PLANE_CRUISE_FALLBACK_MS = 12;

export interface PlanSpeed {
  speedMs: number;
  /** 'survey' = the planned speed; otherwise the airspeed it will really fly. */
  source: 'survey' | 'cruise';
  /** True when the cruise came from the vehicle rather than the fallback. */
  fromVehicle: boolean;
}

/**
 * The speed the turns are actually flown at.
 *
 * A survey speed is a camera-trigger speed, and on a plane it is often set
 * below anything the aircraft can fly. ArduPlane refuses a DO_CHANGE_SPEED
 * below AIRSPEED_MIN rather than clamping it, so the aircraft holds its cruise
 * and the turn is far wider than a radius computed from the requested number.
 * At 6.7 m/s that reads as an 8 m radius, which no fixed wing can fly.
 */
export function planSpeed(config: SurveyConfig, cruiseMs?: number): PlanSpeed {
  const isManual = !!(config.camera.manualCorridorWidth && config.camera.manualCorridorWidth > 0);
  const flyingAsPlane = !isManual && (
    config.pattern === 'corridor'
      ? (config.corridorMode ?? 'plane') === 'plane'
      : config.gridMode === 'plane'
  );
  if (!flyingAsPlane) return { speedMs: config.speed, source: 'survey', fromVehicle: false };

  // The caller's value first, then whatever the vehicle told the survey when
  // it was planned, so the readout and the generator agree on one number.
  const vehicle = cruiseMs && cruiseMs > 0 ? cruiseMs : config.planAirspeed;
  const fromVehicle = !!vehicle && vehicle > 0;
  const cruise = fromVehicle ? vehicle! : PLANE_CRUISE_FALLBACK_MS;
  return config.speed >= cruise
    ? { speedMs: config.speed, source: 'survey', fromVehicle }
    : { speedMs: cruise, source: 'cruise', fromVehicle };
}

/** Turn radius for a survey config, from the speed it will fly and its bank. */
export function planTurnRadius(config: SurveyConfig, cruiseMs?: number): number {
  const explicit = config.engineParams?.['minTurnRadius'];
  if (typeof explicit === 'number' && explicit > 1) return explicit;
  return turnRadiusFor(
    planSpeed(config, cruiseMs ?? config.planAirspeed).speedMs,
    config.planBankDeg ?? DEFAULT_PLAN_BANK_DEG,
  );
}
