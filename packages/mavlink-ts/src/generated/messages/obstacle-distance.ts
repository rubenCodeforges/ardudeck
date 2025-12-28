/**
 * Obstacle distances in front of the sensor, starting from the left in increment degrees to the right
 * Message ID: 330
 * CRC Extra: 183
 */
export interface ObstacleDistance {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Class id of the distance sensor type. */
  sensorType: number;
  /** Distance of obstacles around the vehicle with index 0 corresponding to north + angle_offset, unless otherwise specified in the frame. A value of 0 is valid and means that the obstacle is practically touching the sensor. A value of max_distance +1 means no obstacle is present. A value of UINT16_MAX for unknown/not used. In a array element, one unit corresponds to 1cm. (cm) */
  distances: number[];
  /** Angular width in degrees of each array element. Increment direction is clockwise. This field is ignored if increment_f is non-zero. (deg) */
  increment: number;
  /** Minimum distance the sensor can measure. (cm) */
  minDistance: number;
  /** Maximum distance the sensor can measure. (cm) */
  maxDistance: number;
  /** Angular width in degrees of each array element as a float. If non-zero then this value is used instead of the uint8_t increment field. Positive is clockwise direction, negative is counter-clockwise. (deg) */
  incrementF: number;
  /** Relative angle offset of the 0-index element in the distances array. Value of 0 corresponds to forward. Positive is clockwise direction, negative is counter-clockwise. (deg) */
  angleOffset: number;
  /** Coordinate frame of reference for the yaw rotation and offset of the sensor data. Defaults to MAV_FRAME_GLOBAL, which is north aligned. For body-mounted sensors use MAV_FRAME_BODY_FRD, which is vehicle front aligned. */
  frame: number;
}

export const OBSTACLE_DISTANCE_ID = 330;
export const OBSTACLE_DISTANCE_CRC_EXTRA = 183;
export const OBSTACLE_DISTANCE_MIN_LENGTH = 167;
export const OBSTACLE_DISTANCE_MAX_LENGTH = 167;

export function serializeObstacleDistance(msg: ObstacleDistance): Uint8Array {
  const buffer = new Uint8Array(167);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.incrementF, true);
  view.setFloat32(12, msg.angleOffset, true);
  // Array: distances
  for (let i = 0; i < 72; i++) {
    view.setUint16(16 + i * 2, msg.distances[i] ?? 0, true);
  }
  view.setUint16(160, msg.minDistance, true);
  view.setUint16(162, msg.maxDistance, true);
  buffer[164] = msg.sensorType & 0xff;
  buffer[165] = msg.increment & 0xff;
  buffer[166] = msg.frame & 0xff;

  return buffer;
}

export function deserializeObstacleDistance(payload: Uint8Array): ObstacleDistance {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    incrementF: view.getFloat32(8, true),
    angleOffset: view.getFloat32(12, true),
    distances: Array.from({ length: 72 }, (_, i) => view.getUint16(16 + i * 2, true)),
    minDistance: view.getUint16(160, true),
    maxDistance: view.getUint16(162, true),
    sensorType: payload[164],
    increment: payload[165],
    frame: payload[166],
  };
}