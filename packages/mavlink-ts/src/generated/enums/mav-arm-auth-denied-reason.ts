export enum MavArmAuthDeniedReason {
  /** Not a specific reason */
  MAV_ARM_AUTH_DENIED_REASON_GENERIC = 0,
  /** Authorizer will send the error as string to GCS */
  MAV_ARM_AUTH_DENIED_REASON_NONE = 1,
  /** At least one waypoint have a invalid value */
  MAV_ARM_AUTH_DENIED_REASON_INVALID_WAYPOINT = 2,
  /** Timeout in the authorizer process(in case it depends on network) */
  MAV_ARM_AUTH_DENIED_REASON_TIMEOUT = 3,
  /** Airspace of the mission in use by another vehicle, second result parameter can have the waypoint id that caused it to be denied. */
  MAV_ARM_AUTH_DENIED_REASON_AIRSPACE_IN_USE = 4,
  /** Weather is not good to fly */
  MAV_ARM_AUTH_DENIED_REASON_BAD_WEATHER = 5,
}

/** @deprecated Use MavArmAuthDeniedReason instead */
export const MAV_ARM_AUTH_DENIED_REASON = MavArmAuthDeniedReason;