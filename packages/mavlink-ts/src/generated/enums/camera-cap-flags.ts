/**
 * Camera capability flags (Bitmap)
 * @bitmask
 */
export enum CameraCapFlags {
  /** Camera is able to record video */
  CAMERA_CAP_FLAGS_CAPTURE_VIDEO = 1,
  /** Camera is able to capture images */
  CAMERA_CAP_FLAGS_CAPTURE_IMAGE = 2,
  /** Camera has separate Video and Image/Photo modes (MAV_CMD_SET_CAMERA_MODE) */
  CAMERA_CAP_FLAGS_HAS_MODES = 4,
  /** Camera can capture images while in video mode */
  CAMERA_CAP_FLAGS_CAN_CAPTURE_IMAGE_IN_VIDEO_MODE = 8,
  /** Camera can capture videos while in Photo/Image mode */
  CAMERA_CAP_FLAGS_CAN_CAPTURE_VIDEO_IN_IMAGE_MODE = 16,
  /** Camera has image survey mode (MAV_CMD_SET_CAMERA_MODE) */
  CAMERA_CAP_FLAGS_HAS_IMAGE_SURVEY_MODE = 32,
  /** Camera has basic zoom control (MAV_CMD_SET_CAMERA_ZOOM) */
  CAMERA_CAP_FLAGS_HAS_BASIC_ZOOM = 64,
  /** Camera has basic focus control (MAV_CMD_SET_CAMERA_FOCUS) */
  CAMERA_CAP_FLAGS_HAS_BASIC_FOCUS = 128,
  /** Camera has video streaming capabilities (request VIDEO_STREAM_INFORMATION with MAV_CMD_REQUEST_MESSAGE for video streaming info) */
  CAMERA_CAP_FLAGS_HAS_VIDEO_STREAM = 256,
  /** Camera supports tracking of a point on the camera view. */
  CAMERA_CAP_FLAGS_HAS_TRACKING_POINT = 512,
  /** Camera supports tracking of a selection rectangle on the camera view. */
  CAMERA_CAP_FLAGS_HAS_TRACKING_RECTANGLE = 1024,
  /** Camera supports tracking geo status (CAMERA_TRACKING_GEO_STATUS). */
  CAMERA_CAP_FLAGS_HAS_TRACKING_GEO_STATUS = 2048,
  /** Camera supports absolute thermal range (request CAMERA_THERMAL_RANGE with MAV_CMD_REQUEST_MESSAGE). */
  CAMERA_CAP_FLAGS_HAS_THERMAL_RANGE = 4096,
}

/** @deprecated Use CameraCapFlags instead */
export const CAMERA_CAP_FLAGS = CameraCapFlags;