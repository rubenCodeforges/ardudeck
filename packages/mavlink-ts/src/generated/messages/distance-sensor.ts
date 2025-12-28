/**
 * Distance sensor information for an onboard rangefinder.
 * Message ID: 132
 * CRC Extra: 40
 */
export interface DistanceSensor {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Minimum distance the sensor can measure (cm) */
  minDistance: number;
  /** Maximum distance the sensor can measure (cm) */
  maxDistance: number;
  /** Current distance reading (cm) */
  currentDistance: number;
  /** Type of distance sensor. */
  type: number;
  /** Onboard ID of the sensor */
  id: number;
  /** Direction the sensor faces. downward-facing: ROTATION_PITCH_270, upward-facing: ROTATION_PITCH_90, backward-facing: ROTATION_PITCH_180, forward-facing: ROTATION_NONE, left-facing: ROTATION_YAW_90, right-facing: ROTATION_YAW_270 */
  orientation: number;
  /** Measurement variance. Max standard deviation is 6cm. UINT8_MAX if unknown. (cm^2) */
  covariance: number;
  /** Horizontal Field of View (angle) where the distance measurement is valid and the field of view is known. Otherwise this is set to 0. (rad) */
  horizontalFov: number;
  /** Vertical Field of View (angle) where the distance measurement is valid and the field of view is known. Otherwise this is set to 0. (rad) */
  verticalFov: number;
  /** Quaternion of the sensor orientation in vehicle body frame (w, x, y, z order, zero-rotation is 1, 0, 0, 0). Zero-rotation is along the vehicle body x-axis. This field is required if the orientation is set to MAV_SENSOR_ROTATION_CUSTOM. Set it to 0 if invalid." */
  quaternion: number[];
  /** Signal quality of the sensor. Specific to each sensor type, representing the relation of the signal strength with the target reflectivity, distance, size or aspect, but normalised as a percentage. 0 = unknown/unset signal quality, 1 = invalid signal, 100 = perfect signal. (%) */
  signalQuality: number;
}

export const DISTANCE_SENSOR_ID = 132;
export const DISTANCE_SENSOR_CRC_EXTRA = 40;
export const DISTANCE_SENSOR_MIN_LENGTH = 39;
export const DISTANCE_SENSOR_MAX_LENGTH = 39;

export function serializeDistanceSensor(msg: DistanceSensor): Uint8Array {
  const buffer = new Uint8Array(39);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.horizontalFov, true);
  view.setFloat32(8, msg.verticalFov, true);
  // Array: quaternion
  for (let i = 0; i < 4; i++) {
    view.setFloat32(12 + i * 4, msg.quaternion[i] ?? 0, true);
  }
  view.setUint16(28, msg.minDistance, true);
  view.setUint16(30, msg.maxDistance, true);
  view.setUint16(32, msg.currentDistance, true);
  buffer[34] = msg.type & 0xff;
  buffer[35] = msg.id & 0xff;
  buffer[36] = msg.orientation & 0xff;
  buffer[37] = msg.covariance & 0xff;
  buffer[38] = msg.signalQuality & 0xff;

  return buffer;
}

export function deserializeDistanceSensor(payload: Uint8Array): DistanceSensor {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    horizontalFov: view.getFloat32(4, true),
    verticalFov: view.getFloat32(8, true),
    quaternion: Array.from({ length: 4 }, (_, i) => view.getFloat32(12 + i * 4, true)),
    minDistance: view.getUint16(28, true),
    maxDistance: view.getUint16(30, true),
    currentDistance: view.getUint16(32, true),
    type: payload[34],
    id: payload[35],
    orientation: payload[36],
    covariance: payload[37],
    signalQuality: payload[38],
  };
}