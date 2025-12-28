/**
 * Parachute actions. Trigger release and enable/disable auto-release.
 */
export enum ParachuteAction {
  /** Disable auto-release of parachute (i.e. release triggered by crash detectors). */
  PARACHUTE_DISABLE = 0,
  /** Enable auto-release of parachute. */
  PARACHUTE_ENABLE = 1,
  /** Release parachute and kill motors. */
  PARACHUTE_RELEASE = 2,
}

/** @deprecated Use ParachuteAction instead */
export const PARACHUTE_ACTION = ParachuteAction;