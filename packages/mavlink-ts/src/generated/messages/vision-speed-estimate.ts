/**
 * Speed estimate from a vision source.
 * Message ID: 103
 * CRC Extra: 153
 */
export interface VisionSpeedEstimate {
  /** Timestamp (UNIX time or time since system boot) (us) */
  usec: bigint;
  /** Global X speed (m/s) */
  x: number;
  /** Global Y speed (m/s) */
  y: number;
  /** Global Z speed (m/s) */
  z: number;
  /** Row-major representation of 3x3 linear velocity covariance matrix (states: vx, vy, vz; 1st three entries - 1st row, etc.). If unknown, assign NaN value to first element in the array. */
  covariance: number[];
  /** Estimate reset counter. This should be incremented when the estimate resets in any of the dimensions (position, velocity, attitude, angular speed). This is designed to be used when e.g an external SLAM system detects a loop-closure and the estimate jumps. */
  resetCounter: number;
}

export const VISION_SPEED_ESTIMATE_ID = 103;
export const VISION_SPEED_ESTIMATE_CRC_EXTRA = 153;
export const VISION_SPEED_ESTIMATE_MIN_LENGTH = 57;
export const VISION_SPEED_ESTIMATE_MAX_LENGTH = 57;

export function serializeVisionSpeedEstimate(msg: VisionSpeedEstimate): Uint8Array {
  const buffer = new Uint8Array(57);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.usec), true);
  view.setFloat32(8, msg.x, true);
  view.setFloat32(12, msg.y, true);
  view.setFloat32(16, msg.z, true);
  // Array: covariance
  for (let i = 0; i < 9; i++) {
    view.setFloat32(20 + i * 4, msg.covariance[i] ?? 0, true);
  }
  buffer[56] = msg.resetCounter & 0xff;

  return buffer;
}

export function deserializeVisionSpeedEstimate(payload: Uint8Array): VisionSpeedEstimate {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    usec: view.getBigUint64(0, true),
    x: view.getFloat32(8, true),
    y: view.getFloat32(12, true),
    z: view.getFloat32(16, true),
    covariance: Array.from({ length: 9 }, (_, i) => view.getFloat32(20 + i * 4, true)),
    resetCounter: payload[56],
  };
}