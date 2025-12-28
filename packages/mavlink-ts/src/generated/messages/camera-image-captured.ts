/**
 * Information about a captured image. This is emitted every time a message is captured. It may be re-requested using MAV_CMD_REQUEST_MESSAGE, using param2 to indicate the sequence number for the missing image.
 * Message ID: 263
 * CRC Extra: 133
 */
export interface CameraImageCaptured {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Timestamp (time since UNIX epoch) in UTC. 0 for unknown. (us) */
  timeUtc: bigint;
  /** Deprecated/unused. Component IDs are used to differentiate multiple cameras. */
  cameraId: number;
  /** Latitude where image was taken (degE7) */
  lat: number;
  /** Longitude where capture was taken (degE7) */
  lon: number;
  /** Altitude (MSL) where image was taken (mm) */
  alt: number;
  /** Altitude above ground (mm) */
  relativeAlt: number;
  /** Quaternion of camera orientation (w, x, y, z order, zero-rotation is 1, 0, 0, 0) */
  q: number[];
  /** Zero based index of this image (i.e. a new image will have index CAMERA_CAPTURE_STATUS.image count -1) */
  imageIndex: number;
  /** Image was captured successfully (MAV_BOOL_TRUE). Values not equal to 0 or 1 are invalid. */
  captureResult: number;
  /** URL of image taken. Either local storage or http://foo.jpg if camera provides an HTTP interface. */
  fileUrl: string;
}

export const CAMERA_IMAGE_CAPTURED_ID = 263;
export const CAMERA_IMAGE_CAPTURED_CRC_EXTRA = 133;
export const CAMERA_IMAGE_CAPTURED_MIN_LENGTH = 255;
export const CAMERA_IMAGE_CAPTURED_MAX_LENGTH = 255;

export function serializeCameraImageCaptured(msg: CameraImageCaptured): Uint8Array {
  const buffer = new Uint8Array(255);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUtc), true);
  view.setUint32(8, msg.timeBootMs, true);
  view.setInt32(12, msg.lat, true);
  view.setInt32(16, msg.lon, true);
  view.setInt32(20, msg.alt, true);
  view.setInt32(24, msg.relativeAlt, true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(28 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setInt32(44, msg.imageIndex, true);
  buffer[48] = msg.cameraId & 0xff;
  view.setInt8(49, msg.captureResult);
  // String: file_url
  const fileUrlBytes = new TextEncoder().encode(msg.fileUrl || '');
  buffer.set(fileUrlBytes.slice(0, 205), 50);

  return buffer;
}

export function deserializeCameraImageCaptured(payload: Uint8Array): CameraImageCaptured {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUtc: view.getBigUint64(0, true),
    timeBootMs: view.getUint32(8, true),
    lat: view.getInt32(12, true),
    lon: view.getInt32(16, true),
    alt: view.getInt32(20, true),
    relativeAlt: view.getInt32(24, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(28 + i * 4, true)),
    imageIndex: view.getInt32(44, true),
    cameraId: payload[48],
    captureResult: view.getInt8(49),
    fileUrl: new TextDecoder().decode(payload.slice(50, 255)).replace(/\0.*$/, ''),
  };
}