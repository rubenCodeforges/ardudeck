/**
 * Camera sources for MAV_CMD_SET_CAMERA_SOURCE
 */
export enum CameraSource {
  /** Default camera source. */
  CAMERA_SOURCE_DEFAULT = 0,
  /** RGB camera source. */
  CAMERA_SOURCE_RGB = 1,
  /** IR camera source. */
  CAMERA_SOURCE_IR = 2,
  /** NDVI camera source. */
  CAMERA_SOURCE_NDVI = 3,
}

/** @deprecated Use CameraSource instead */
export const CAMERA_SOURCE = CameraSource;