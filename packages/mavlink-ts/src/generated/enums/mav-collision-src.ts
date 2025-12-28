/**
 * Source of information about this collision.
 */
export enum MavCollisionSrc {
  /** ID field references ADSB_VEHICLE packets */
  MAV_COLLISION_SRC_ADSB = 0,
  /** ID field references MAVLink SRC ID */
  MAV_COLLISION_SRC_MAVLINK_GPS_GLOBAL_INT = 1,
}

/** @deprecated Use MavCollisionSrc instead */
export const MAV_COLLISION_SRC = MavCollisionSrc;