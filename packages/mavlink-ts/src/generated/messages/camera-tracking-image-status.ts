/**
 * Camera tracking status, sent while in active tracking. Use MAV_CMD_SET_MESSAGE_INTERVAL to define message interval.
 * Message ID: 275
 * CRC Extra: 126
 */
export interface CameraTrackingImageStatus {
  /** Current tracking status */
  trackingStatus: number;
  /** Current tracking mode */
  trackingMode: number;
  /** Defines location of target data */
  targetData: number;
  /** Current tracked point x value if CAMERA_TRACKING_MODE_POINT (normalized 0..1, 0 is left, 1 is right), NAN if unknown */
  pointX: number;
  /** Current tracked point y value if CAMERA_TRACKING_MODE_POINT (normalized 0..1, 0 is top, 1 is bottom), NAN if unknown */
  pointY: number;
  /** Current tracked radius if CAMERA_TRACKING_MODE_POINT (normalized 0..1, 0 is image left, 1 is image right), NAN if unknown */
  radius: number;
  /** Current tracked rectangle top x value if CAMERA_TRACKING_MODE_RECTANGLE (normalized 0..1, 0 is left, 1 is right), NAN if unknown */
  recTopX: number;
  /** Current tracked rectangle top y value if CAMERA_TRACKING_MODE_RECTANGLE (normalized 0..1, 0 is top, 1 is bottom), NAN if unknown */
  recTopY: number;
  /** Current tracked rectangle bottom x value if CAMERA_TRACKING_MODE_RECTANGLE (normalized 0..1, 0 is left, 1 is right), NAN if unknown */
  recBottomX: number;
  /** Current tracked rectangle bottom y value if CAMERA_TRACKING_MODE_RECTANGLE (normalized 0..1, 0 is top, 1 is bottom), NAN if unknown */
  recBottomY: number;
}

export const CAMERA_TRACKING_IMAGE_STATUS_ID = 275;
export const CAMERA_TRACKING_IMAGE_STATUS_CRC_EXTRA = 126;
export const CAMERA_TRACKING_IMAGE_STATUS_MIN_LENGTH = 31;
export const CAMERA_TRACKING_IMAGE_STATUS_MAX_LENGTH = 31;

export function serializeCameraTrackingImageStatus(msg: CameraTrackingImageStatus): Uint8Array {
  const buffer = new Uint8Array(31);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.pointX, true);
  view.setFloat32(4, msg.pointY, true);
  view.setFloat32(8, msg.radius, true);
  view.setFloat32(12, msg.recTopX, true);
  view.setFloat32(16, msg.recTopY, true);
  view.setFloat32(20, msg.recBottomX, true);
  view.setFloat32(24, msg.recBottomY, true);
  buffer[28] = msg.trackingStatus & 0xff;
  buffer[29] = msg.trackingMode & 0xff;
  buffer[30] = msg.targetData & 0xff;

  return buffer;
}

export function deserializeCameraTrackingImageStatus(payload: Uint8Array): CameraTrackingImageStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    pointX: view.getFloat32(0, true),
    pointY: view.getFloat32(4, true),
    radius: view.getFloat32(8, true),
    recTopX: view.getFloat32(12, true),
    recTopY: view.getFloat32(16, true),
    recBottomX: view.getFloat32(20, true),
    recBottomY: view.getFloat32(24, true),
    trackingStatus: payload[28],
    trackingMode: payload[29],
    targetData: payload[30],
  };
}