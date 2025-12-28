/**
 * Bitmap to indicate which dimensions should be ignored by the vehicle: a value of 0b0000000000000000 or 0b0000001000000000 indicates that none of the setpoint dimensions should be ignored. If bit 9 is set the floats afx afy afz should be interpreted as force instead of acceleration.
 * @bitmask
 */
export enum PositionTargetTypemask {
  /** Ignore position x */
  POSITION_TARGET_TYPEMASK_X_IGNORE = 1,
  /** Ignore position y */
  POSITION_TARGET_TYPEMASK_Y_IGNORE = 2,
  /** Ignore position z */
  POSITION_TARGET_TYPEMASK_Z_IGNORE = 4,
  /** Ignore velocity x */
  POSITION_TARGET_TYPEMASK_VX_IGNORE = 8,
  /** Ignore velocity y */
  POSITION_TARGET_TYPEMASK_VY_IGNORE = 16,
  /** Ignore velocity z */
  POSITION_TARGET_TYPEMASK_VZ_IGNORE = 32,
  /** Ignore acceleration x */
  POSITION_TARGET_TYPEMASK_AX_IGNORE = 64,
  /** Ignore acceleration y */
  POSITION_TARGET_TYPEMASK_AY_IGNORE = 128,
  /** Ignore acceleration z */
  POSITION_TARGET_TYPEMASK_AZ_IGNORE = 256,
  /** Use force instead of acceleration */
  POSITION_TARGET_TYPEMASK_FORCE_SET = 512,
  /** Ignore yaw */
  POSITION_TARGET_TYPEMASK_YAW_IGNORE = 1024,
  /** Ignore yaw rate */
  POSITION_TARGET_TYPEMASK_YAW_RATE_IGNORE = 2048,
}

/** @deprecated Use PositionTargetTypemask instead */
export const POSITION_TARGET_TYPEMASK = PositionTargetTypemask;