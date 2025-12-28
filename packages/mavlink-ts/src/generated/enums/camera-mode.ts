/**
 * Camera Modes.
 */
export enum CameraMode {
  /** Camera is in image/photo capture mode. */
  CAMERA_MODE_IMAGE = 0,
  /** Camera is in video capture mode. */
  CAMERA_MODE_VIDEO = 1,
  /** Camera is in image survey capture mode. It allows for camera controller to do specific settings for surveys. */
  CAMERA_MODE_IMAGE_SURVEY = 2,
}

/** @deprecated Use CameraMode instead */
export const CAMERA_MODE = CameraMode;