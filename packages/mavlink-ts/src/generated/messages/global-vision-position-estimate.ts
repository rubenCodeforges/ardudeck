/**
 * Global position/attitude estimate from a vision source.
 * Message ID: 101
 * CRC Extra: 18
 */
export interface GlobalVisionPositionEstimate {
  /** Timestamp (UNIX time or since system boot) (us) */
  usec: bigint;
  /** Global X position (m) */
  x: number;
  /** Global Y position (m) */
  y: number;
  /** Global Z position (m) */
  z: number;
  /** Roll angle (rad) */
  roll: number;
  /** Pitch angle (rad) */
  pitch: number;
  /** Yaw angle (rad) */
  yaw: number;
  /** Row-major representation of pose 6x6 cross-covariance matrix upper right triangle (states: x_global, y_global, z_global, roll, pitch, yaw; first six entries are the first ROW, next five entries are the second ROW, etc.). If unknown, assign NaN value to first element in the array. */
  covariance: number[];
  /** Estimate reset counter. This should be incremented when the estimate resets in any of the dimensions (position, velocity, attitude, angular speed). This is designed to be used when e.g an external SLAM system detects a loop-closure and the estimate jumps. */
  resetCounter: number;
}

export const GLOBAL_VISION_POSITION_ESTIMATE_ID = 101;
export const GLOBAL_VISION_POSITION_ESTIMATE_CRC_EXTRA = 18;
export const GLOBAL_VISION_POSITION_ESTIMATE_MIN_LENGTH = 117;
export const GLOBAL_VISION_POSITION_ESTIMATE_MAX_LENGTH = 117;

export function serializeGlobalVisionPositionEstimate(msg: GlobalVisionPositionEstimate): Uint8Array {
  const buffer = new Uint8Array(117);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.usec), true);
  view.setFloat32(8, msg.x, true);
  view.setFloat32(12, msg.y, true);
  view.setFloat32(16, msg.z, true);
  view.setFloat32(20, msg.roll, true);
  view.setFloat32(24, msg.pitch, true);
  view.setFloat32(28, msg.yaw, true);
  // Array: covariance
  for (let i = 0; i < 21; i++) {
    view.setFloat32(32 + i * 4, msg.covariance[i] ?? 0, true);
  }
  buffer[116] = msg.resetCounter & 0xff;

  return buffer;
}

export function deserializeGlobalVisionPositionEstimate(payload: Uint8Array): GlobalVisionPositionEstimate {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    usec: view.getBigUint64(0, true),
    x: view.getFloat32(8, true),
    y: view.getFloat32(12, true),
    z: view.getFloat32(16, true),
    roll: view.getFloat32(20, true),
    pitch: view.getFloat32(24, true),
    yaw: view.getFloat32(28, true),
    covariance: Array.from({ length: 21 }, (_, i) => view.getFloat32(32 + i * 4, true)),
    resetCounter: payload[116],
  };
}