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

/** Turn radius for a survey config, from its planned speed and bank. */
export function planTurnRadius(config: SurveyConfig): number {
  const explicit = config.engineParams?.['minTurnRadius'];
  if (typeof explicit === 'number' && explicit > 1) return explicit;
  return turnRadiusFor(config.speed, config.planBankDeg ?? DEFAULT_PLAN_BANK_DEG);
}
