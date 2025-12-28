/**
 * Camera absolute thermal range. This can be streamed when the associated `VIDEO_STREAM_STATUS.flag` bit `VIDEO_STREAM_STATUS_FLAGS_THERMAL_RANGE_ENABLED` is set, but a GCS may choose to only request it for the current active stream. Use MAV_CMD_SET_MESSAGE_INTERVAL to define message interval (param3 indicates the stream id of the current camera, or 0 for all streams, param4 indicates the target camera_device_id for autopilot-attached cameras or 0 for MAVLink cameras).
 * Message ID: 277
 * CRC Extra: 62
 */
export interface CameraThermalRange {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Video Stream ID (1 for first, 2 for second, etc.) */
  streamId: number;
  /** Camera id of a non-MAVLink camera attached to an autopilot (1-6).  0 if the component is a MAVLink camera (with its own component id). */
  cameraDeviceId: number;
  /** Temperature max. (degC) */
  max: number;
  /** Temperature max point x value (normalized 0..1, 0 is left, 1 is right), NAN if unknown. */
  maxPointX: number;
  /** Temperature max point y value (normalized 0..1, 0 is top, 1 is bottom), NAN if unknown. */
  maxPointY: number;
  /** Temperature min. (degC) */
  min: number;
  /** Temperature min point x value (normalized 0..1, 0 is left, 1 is right), NAN if unknown. */
  minPointX: number;
  /** Temperature min point y value (normalized 0..1, 0 is top, 1 is bottom), NAN if unknown. */
  minPointY: number;
}

export const CAMERA_THERMAL_RANGE_ID = 277;
export const CAMERA_THERMAL_RANGE_CRC_EXTRA = 62;
export const CAMERA_THERMAL_RANGE_MIN_LENGTH = 30;
export const CAMERA_THERMAL_RANGE_MAX_LENGTH = 30;

export function serializeCameraThermalRange(msg: CameraThermalRange): Uint8Array {
  const buffer = new Uint8Array(30);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.max, true);
  view.setFloat32(8, msg.maxPointX, true);
  view.setFloat32(12, msg.maxPointY, true);
  view.setFloat32(16, msg.min, true);
  view.setFloat32(20, msg.minPointX, true);
  view.setFloat32(24, msg.minPointY, true);
  buffer[28] = msg.streamId & 0xff;
  buffer[29] = msg.cameraDeviceId & 0xff;

  return buffer;
}

export function deserializeCameraThermalRange(payload: Uint8Array): CameraThermalRange {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    max: view.getFloat32(4, true),
    maxPointX: view.getFloat32(8, true),
    maxPointY: view.getFloat32(12, true),
    min: view.getFloat32(16, true),
    minPointX: view.getFloat32(20, true),
    minPointY: view.getFloat32(24, true),
    streamId: payload[28],
    cameraDeviceId: payload[29],
  };
}