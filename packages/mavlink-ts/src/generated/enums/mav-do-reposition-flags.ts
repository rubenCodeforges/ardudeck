/**
 * Bitmap of options for the MAV_CMD_DO_REPOSITION
 * @bitmask
 */
export enum MavDoRepositionFlags {
  /** The aircraft should immediately transition into guided. This should not be set for follow me applications */
  MAV_DO_REPOSITION_FLAGS_CHANGE_MODE = 1,
}

/** @deprecated Use MavDoRepositionFlags instead */
export const MAV_DO_REPOSITION_FLAGS = MavDoRepositionFlags;