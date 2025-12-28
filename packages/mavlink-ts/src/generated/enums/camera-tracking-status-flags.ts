/**
 * Camera tracking status flags
 */
export enum CameraTrackingStatusFlags {
  /** Camera is not tracking */
  CAMERA_TRACKING_STATUS_FLAGS_IDLE = 0,
  /** Camera is tracking */
  CAMERA_TRACKING_STATUS_FLAGS_ACTIVE = 1,
  /** Camera tracking in error state */
  CAMERA_TRACKING_STATUS_FLAGS_ERROR = 2,
}

/** @deprecated Use CameraTrackingStatusFlags instead */
export const CAMERA_TRACKING_STATUS_FLAGS = CameraTrackingStatusFlags;