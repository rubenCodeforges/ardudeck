/**
 * Zoom types for MAV_CMD_SET_CAMERA_ZOOM
 */
export enum CameraZoomType {
  /** Zoom one step increment (-1 for wide, 1 for tele) */
  ZOOM_TYPE_STEP = 0,
  /** Continuous zoom up/down until stopped (-1 for wide, 1 for tele, 0 to stop zooming) */
  ZOOM_TYPE_CONTINUOUS = 1,
  /** Zoom value as proportion of full camera range (a percentage value between 0.0 and 100.0) */
  ZOOM_TYPE_RANGE = 2,
  /** Zoom value/variable focal length in millimetres. Note that there is no message to get the valid zoom range of the camera, so this can type can only be used for cameras where the zoom range is known (implying that this cannot reliably be used in a GCS for an arbitrary camera) */
  ZOOM_TYPE_FOCAL_LENGTH = 3,
}

/** @deprecated Use CameraZoomType instead */
export const CAMERA_ZOOM_TYPE = CameraZoomType;