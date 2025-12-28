/**
 * Possible safety switch states.
 */
export enum SafetySwitchState {
  /** Safety switch is engaged and vehicle should be safe to approach. */
  SAFETY_SWITCH_STATE_SAFE = 0,
  /** Safety switch is NOT engaged and motors, propellers and other actuators should be considered active. */
  SAFETY_SWITCH_STATE_DANGEROUS = 1,
}

/** @deprecated Use SafetySwitchState instead */
export const SAFETY_SWITCH_STATE = SafetySwitchState;