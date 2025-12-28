export enum CameraFeedbackFlags {
  /** Shooting photos, not video. */
  CAMERA_FEEDBACK_PHOTO = 0,
  /** Shooting video, not stills. */
  CAMERA_FEEDBACK_VIDEO = 1,
  /** Unable to achieve requested exposure (e.g. shutter speed too low). */
  CAMERA_FEEDBACK_BADEXPOSURE = 2,
  /** Closed loop feedback from camera, we know for sure it has successfully taken a picture. */
  CAMERA_FEEDBACK_CLOSEDLOOP = 3,
  /** Open loop camera, an image trigger has been requested but we can't know for sure it has successfully taken a picture. */
  CAMERA_FEEDBACK_OPENLOOP = 4,
}

/** @deprecated Use CameraFeedbackFlags instead */
export const CAMERA_FEEDBACK_FLAGS = CameraFeedbackFlags;