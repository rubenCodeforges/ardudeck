/**
 * Enumeration of possible mount operation modes. This message is used by obsolete/deprecated gimbal messages.
 */
export enum MavMountMode {
  /** Load and keep safe position (Roll,Pitch,Yaw) from permanent memory and stop stabilization */
  MAV_MOUNT_MODE_RETRACT = 0,
  /** Load and keep neutral position (Roll,Pitch,Yaw) from permanent memory. */
  MAV_MOUNT_MODE_NEUTRAL = 1,
  /** Load neutral position and start MAVLink Roll,Pitch,Yaw control with stabilization */
  MAV_MOUNT_MODE_MAVLINK_TARGETING = 2,
  /** Load neutral position and start RC Roll,Pitch,Yaw control with stabilization */
  MAV_MOUNT_MODE_RC_TARGETING = 3,
  /** Load neutral position and start to point to Lat,Lon,Alt */
  MAV_MOUNT_MODE_GPS_POINT = 4,
  /** Gimbal tracks system with specified system ID */
  MAV_MOUNT_MODE_SYSID_TARGET = 5,
  /** Gimbal tracks home position */
  MAV_MOUNT_MODE_HOME_LOCATION = 6,
}

/** @deprecated Use MavMountMode instead */
export const MAV_MOUNT_MODE = MavMountMode;