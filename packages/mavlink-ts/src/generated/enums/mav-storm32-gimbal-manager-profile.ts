/**
 * Gimbal manager profiles. Only standard profiles are defined. Any implementation can define its own profile(s) in addition, and should use enum values > 16.
 */
export enum MavStorm32GimbalManagerProfile {
  /** Default profile. Implementation specific. */
  MAV_STORM32_GIMBAL_MANAGER_PROFILE_DEFAULT = 0,
  /** Not supported/deprecated. */
  MAV_STORM32_GIMBAL_MANAGER_PROFILE_CUSTOM = 1,
  /** Profile with cooperative behavior. */
  MAV_STORM32_GIMBAL_MANAGER_PROFILE_COOPERATIVE = 2,
  /** Profile with exclusive behavior. */
  MAV_STORM32_GIMBAL_MANAGER_PROFILE_EXCLUSIVE = 3,
  /** Profile with priority and cooperative behavior for equal priority. */
  MAV_STORM32_GIMBAL_MANAGER_PROFILE_PRIORITY_COOPERATIVE = 4,
  /** Profile with priority and exclusive behavior for equal priority. */
  MAV_STORM32_GIMBAL_MANAGER_PROFILE_PRIORITY_EXCLUSIVE = 5,
}

/** @deprecated Use MavStorm32GimbalManagerProfile instead */
export const MAV_STORM32_GIMBAL_MANAGER_PROFILE = MavStorm32GimbalManagerProfile;