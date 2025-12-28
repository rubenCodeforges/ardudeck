/**
 * Enumeration of possible shot modes.
 */
export enum MavQshotMode {
  /** Undefined shot mode. Can be used to determine if qshots should be used or not. */
  MAV_QSHOT_MODE_UNDEFINED = 0,
  /** Start normal gimbal operation. Is usually used to return back from a shot. */
  MAV_QSHOT_MODE_DEFAULT = 1,
  /** Load and keep safe gimbal position and stop stabilization. */
  MAV_QSHOT_MODE_GIMBAL_RETRACT = 2,
  /** Load neutral gimbal position and keep it while stabilizing. */
  MAV_QSHOT_MODE_GIMBAL_NEUTRAL = 3,
  /** Start mission with gimbal control. */
  MAV_QSHOT_MODE_GIMBAL_MISSION = 4,
  /** Start RC gimbal control. */
  MAV_QSHOT_MODE_GIMBAL_RC_CONTROL = 5,
  /** Start gimbal tracking the point specified by Lat, Lon, Alt. */
  MAV_QSHOT_MODE_POI_TARGETING = 6,
  /** Start gimbal tracking the system with specified system ID. */
  MAV_QSHOT_MODE_SYSID_TARGETING = 7,
  /** Start 2-point cable cam quick shot. */
  MAV_QSHOT_MODE_CABLECAM_2POINT = 8,
  /** Start gimbal tracking the home location. */
  MAV_QSHOT_MODE_HOME_TARGETING = 9,
}

/** @deprecated Use MavQshotMode instead */
export const MAV_QSHOT_MODE = MavQshotMode;