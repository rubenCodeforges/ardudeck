/**
 * The ROI (region of interest) for the vehicle. This can be
 *                 be used by the vehicle for camera/vehicle attitude alignment (see
 *                 MAV_CMD_NAV_ROI).
 */
export enum MavRoi {
  /** No region of interest. */
  MAV_ROI_NONE = 0,
  /** Point toward next waypoint, with optional pitch/roll/yaw offset. */
  MAV_ROI_WPNEXT = 1,
  /** Point toward given waypoint. */
  MAV_ROI_WPINDEX = 2,
  /** Point toward fixed location. */
  MAV_ROI_LOCATION = 3,
  /** Point toward of given id. */
  MAV_ROI_TARGET = 4,
}

/** @deprecated Use MavRoi instead */
export const MAV_ROI = MavRoi;