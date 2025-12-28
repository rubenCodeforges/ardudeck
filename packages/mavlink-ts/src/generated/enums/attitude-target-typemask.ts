/**
 * Bitmap to indicate which dimensions should be ignored by the vehicle: a value of 0b00000000 indicates that none of the setpoint dimensions should be ignored.
 * @bitmask
 */
export enum AttitudeTargetTypemask {
  /** Ignore body roll rate */
  ATTITUDE_TARGET_TYPEMASK_BODY_ROLL_RATE_IGNORE = 1,
  /** Ignore body pitch rate */
  ATTITUDE_TARGET_TYPEMASK_BODY_PITCH_RATE_IGNORE = 2,
  /** Ignore body yaw rate */
  ATTITUDE_TARGET_TYPEMASK_BODY_YAW_RATE_IGNORE = 4,
  /** Ignore throttle */
  ATTITUDE_TARGET_TYPEMASK_THROTTLE_IGNORE = 64,
  /** Ignore attitude */
  ATTITUDE_TARGET_TYPEMASK_ATTITUDE_IGNORE = 128,
}

/** @deprecated Use AttitudeTargetTypemask instead */
export const ATTITUDE_TARGET_TYPEMASK = AttitudeTargetTypemask;