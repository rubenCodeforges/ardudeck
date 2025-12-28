/**
 * Gimbal manager capability flags.
 * @bitmask
 */
export enum MavStorm32GimbalManagerCapFlags {
  /** The gimbal manager supports several profiles. */
  MAV_STORM32_GIMBAL_MANAGER_CAP_FLAGS_HAS_PROFILES = 1,
}

/** @deprecated Use MavStorm32GimbalManagerCapFlags instead */
export const MAV_STORM32_GIMBAL_MANAGER_CAP_FLAGS = MavStorm32GimbalManagerCapFlags;