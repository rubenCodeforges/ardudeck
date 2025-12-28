export enum MavModeGimbal {
  /** Gimbal is powered on but has not started initializing yet. */
  MAV_MODE_GIMBAL_UNINITIALIZED = 0,
  /** Gimbal is currently running calibration on the pitch axis. */
  MAV_MODE_GIMBAL_CALIBRATING_PITCH = 1,
  /** Gimbal is currently running calibration on the roll axis. */
  MAV_MODE_GIMBAL_CALIBRATING_ROLL = 2,
  /** Gimbal is currently running calibration on the yaw axis. */
  MAV_MODE_GIMBAL_CALIBRATING_YAW = 3,
  /** Gimbal has finished calibrating and initializing, but is relaxed pending reception of first rate command from copter. */
  MAV_MODE_GIMBAL_INITIALIZED = 4,
  /** Gimbal is actively stabilizing. */
  MAV_MODE_GIMBAL_ACTIVE = 5,
  /** Gimbal is relaxed because it missed more than 10 expected rate command messages in a row. Gimbal will move back to active mode when it receives a new rate command. */
  MAV_MODE_GIMBAL_RATE_CMD_TIMEOUT = 6,
}

/** @deprecated Use MavModeGimbal instead */
export const MAV_MODE_GIMBAL = MavModeGimbal;