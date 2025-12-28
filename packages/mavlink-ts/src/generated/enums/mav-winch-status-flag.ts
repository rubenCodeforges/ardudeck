/**
 * Winch status flags used in WINCH_STATUS
 * @bitmask
 */
export enum MavWinchStatusFlag {
  /** Winch is healthy */
  MAV_WINCH_STATUS_HEALTHY = 1,
  /** Winch thread is fully retracted */
  MAV_WINCH_STATUS_FULLY_RETRACTED = 2,
  /** Winch motor is moving */
  MAV_WINCH_STATUS_MOVING = 4,
  /** Winch clutch is engaged allowing motor to move freely */
  MAV_WINCH_STATUS_CLUTCH_ENGAGED = 8,
}

/** @deprecated Use MavWinchStatusFlag instead */
export const MAV_WINCH_STATUS_FLAG = MavWinchStatusFlag;