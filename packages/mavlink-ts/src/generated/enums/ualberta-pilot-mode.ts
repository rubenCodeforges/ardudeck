/**
 * Mode currently commanded by pilot
 */
export enum UalbertaPilotMode {
  /** sdf */
  PILOT_MANUAL = 1,
  /** dfs */
  PILOT_AUTO = 2,
  /** Rotomotion mode */
  PILOT_ROTO = 3,
}

/** @deprecated Use UalbertaPilotMode instead */
export const UALBERTA_PILOT_MODE = UalbertaPilotMode;