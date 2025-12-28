export enum GimbalAxis {
  /** Gimbal yaw axis. */
  GIMBAL_AXIS_YAW = 0,
  /** Gimbal pitch axis. */
  GIMBAL_AXIS_PITCH = 1,
  /** Gimbal roll axis. */
  GIMBAL_AXIS_ROLL = 2,
}

/** @deprecated Use GimbalAxis instead */
export const GIMBAL_AXIS = GimbalAxis;