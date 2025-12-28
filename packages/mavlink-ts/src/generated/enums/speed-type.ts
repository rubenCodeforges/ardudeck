/**
 * Speed setpoint types used in MAV_CMD_DO_CHANGE_SPEED
 */
export enum SpeedType {
  /** Airspeed */
  SPEED_TYPE_AIRSPEED = 0,
  /** Groundspeed */
  SPEED_TYPE_GROUNDSPEED = 1,
  /** Climb speed */
  SPEED_TYPE_CLIMB_SPEED = 2,
  /** Descent speed */
  SPEED_TYPE_DESCENT_SPEED = 3,
}

/** @deprecated Use SpeedType instead */
export const SPEED_TYPE = SpeedType;