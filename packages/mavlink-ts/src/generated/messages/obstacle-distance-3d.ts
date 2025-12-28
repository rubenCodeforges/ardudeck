/**
 * Obstacle located as a 3D vector.
 * Message ID: 11037
 * CRC Extra: 130
 */
export interface ObstacleDistance3d {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Class id of the distance sensor type. */
  sensorType: number;
  /** Coordinate frame of reference. */
  frame: number;
  /** Unique ID given to each obstacle so that its movement can be tracked. Use UINT16_MAX if object ID is unknown or cannot be determined. */
  obstacleId: number;
  /** X position of the obstacle. (m) */
  x: number;
  /** Y position of the obstacle. (m) */
  y: number;
  /** Z position of the obstacle. (m) */
  z: number;
  /** Minimum distance the sensor can measure. (m) */
  minDistance: number;
  /** Maximum distance the sensor can measure. (m) */
  maxDistance: number;
}

export const OBSTACLE_DISTANCE_3D_ID = 11037;
export const OBSTACLE_DISTANCE_3D_CRC_EXTRA = 130;
export const OBSTACLE_DISTANCE_3D_MIN_LENGTH = 28;
export const OBSTACLE_DISTANCE_3D_MAX_LENGTH = 28;

export function serializeObstacleDistance3d(msg: ObstacleDistance3d): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.x, true);
  view.setFloat32(8, msg.y, true);
  view.setFloat32(12, msg.z, true);
  view.setFloat32(16, msg.minDistance, true);
  view.setFloat32(20, msg.maxDistance, true);
  view.setUint16(24, msg.obstacleId, true);
  buffer[26] = msg.sensorType & 0xff;
  buffer[27] = msg.frame & 0xff;

  return buffer;
}

export function deserializeObstacleDistance3d(payload: Uint8Array): ObstacleDistance3d {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    x: view.getFloat32(4, true),
    y: view.getFloat32(8, true),
    z: view.getFloat32(12, true),
    minDistance: view.getFloat32(16, true),
    maxDistance: view.getFloat32(20, true),
    obstacleId: view.getUint16(24, true),
    sensorType: payload[26],
    frame: payload[27],
  };
}