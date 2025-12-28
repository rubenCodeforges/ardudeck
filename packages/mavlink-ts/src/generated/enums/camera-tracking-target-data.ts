/**
 * Camera tracking target data (shows where tracked target is within image)
 * @bitmask
 */
export enum CameraTrackingTargetData {
  /** Target data embedded in image data (proprietary) */
  CAMERA_TRACKING_TARGET_DATA_EMBEDDED = 1,
  /** Target data rendered in image */
  CAMERA_TRACKING_TARGET_DATA_RENDERED = 2,
  /** Target data within status message (Point or Rectangle) */
  CAMERA_TRACKING_TARGET_DATA_IN_STATUS = 4,
}

/** @deprecated Use CameraTrackingTargetData instead */
export const CAMERA_TRACKING_TARGET_DATA = CameraTrackingTargetData;