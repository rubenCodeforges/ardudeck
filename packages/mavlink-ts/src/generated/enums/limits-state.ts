export enum LimitsState {
  /** Pre-initialization. */
  LIMITS_INIT = 0,
  /** Disabled. */
  LIMITS_DISABLED = 1,
  /** Checking limits. */
  LIMITS_ENABLED = 2,
  /** A limit has been breached. */
  LIMITS_TRIGGERED = 3,
  /** Taking action e.g. Return/RTL. */
  LIMITS_RECOVERING = 4,
  /** We're no longer in breach of a limit. */
  LIMITS_RECOVERED = 5,
}

/** @deprecated Use LimitsState instead */
export const LIMITS_STATE = LimitsState;