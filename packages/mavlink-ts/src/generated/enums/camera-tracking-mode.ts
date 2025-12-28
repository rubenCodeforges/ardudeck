/**
 * Camera tracking modes
 */
export enum CameraTrackingMode {
  /** Not tracking */
  CAMERA_TRACKING_MODE_NONE = 0,
  /** Target is a point */
  CAMERA_TRACKING_MODE_POINT = 1,
  /** Target is a rectangle */
  CAMERA_TRACKING_MODE_RECTANGLE = 2,
}

/** @deprecated Use CameraTrackingMode instead */
export const CAMERA_TRACKING_MODE = CameraTrackingMode;