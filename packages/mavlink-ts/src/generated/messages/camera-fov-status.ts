/**
 * Information about the field of view of a camera. Can be requested with a MAV_CMD_REQUEST_MESSAGE command.
 * Message ID: 271
 * CRC Extra: 22
 */
export interface CameraFovStatus {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Latitude of camera (INT32_MAX if unknown). (degE7) */
  latCamera: number;
  /** Longitude of camera (INT32_MAX if unknown). (degE7) */
  lonCamera: number;
  /** Altitude (MSL) of camera (INT32_MAX if unknown). (mm) */
  altCamera: number;
  /** Latitude of center of image (INT32_MAX if unknown, INT32_MIN if at infinity, not intersecting with horizon). (degE7) */
  latImage: number;
  /** Longitude of center of image (INT32_MAX if unknown, INT32_MIN if at infinity, not intersecting with horizon). (degE7) */
  lonImage: number;
  /** Altitude (MSL) of center of image (INT32_MAX if unknown, INT32_MIN if at infinity, not intersecting with horizon). (mm) */
  altImage: number;
  /** Quaternion of camera orientation (w, x, y, z order, zero-rotation is 1, 0, 0, 0) */
  q: number[];
  /** Horizontal field of view (NaN if unknown). (deg) */
  hfov: number;
  /** Vertical field of view (NaN if unknown). (deg) */
  vfov: number;
}

export const CAMERA_FOV_STATUS_ID = 271;
export const CAMERA_FOV_STATUS_CRC_EXTRA = 22;
export const CAMERA_FOV_STATUS_MIN_LENGTH = 52;
export const CAMERA_FOV_STATUS_MAX_LENGTH = 52;

export function serializeCameraFovStatus(msg: CameraFovStatus): Uint8Array {
  const buffer = new Uint8Array(52);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setInt32(4, msg.latCamera, true);
  view.setInt32(8, msg.lonCamera, true);
  view.setInt32(12, msg.altCamera, true);
  view.setInt32(16, msg.latImage, true);
  view.setInt32(20, msg.lonImage, true);
  view.setInt32(24, msg.altImage, true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(28 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(44, msg.hfov, true);
  view.setFloat32(48, msg.vfov, true);

  return buffer;
}

export function deserializeCameraFovStatus(payload: Uint8Array): CameraFovStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    latCamera: view.getInt32(4, true),
    lonCamera: view.getInt32(8, true),
    altCamera: view.getInt32(12, true),
    latImage: view.getInt32(16, true),
    lonImage: view.getInt32(20, true),
    altImage: view.getInt32(24, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(28 + i * 4, true)),
    hfov: view.getFloat32(44, true),
    vfov: view.getFloat32(48, true),
  };
}