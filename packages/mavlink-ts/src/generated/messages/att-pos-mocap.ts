/**
 * Motion capture attitude and position
 * Message ID: 138
 * CRC Extra: 19
 */
export interface AttPosMocap {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Attitude quaternion (w, x, y, z order, zero-rotation is 1, 0, 0, 0) */
  q: number[];
  /** X position (NED) (m) */
  x: number;
  /** Y position (NED) (m) */
  y: number;
  /** Z position (NED) (m) */
  z: number;
  /** Row-major representation of a pose 6x6 cross-covariance matrix upper right triangle (states: x, y, z, roll, pitch, yaw; first six entries are the first ROW, next five entries are the second ROW, etc.). If unknown, assign NaN value to first element in the array. */
  covariance: number[];
}

export const ATT_POS_MOCAP_ID = 138;
export const ATT_POS_MOCAP_CRC_EXTRA = 19;
export const ATT_POS_MOCAP_MIN_LENGTH = 120;
export const ATT_POS_MOCAP_MAX_LENGTH = 120;

export function serializeAttPosMocap(msg: AttPosMocap): Uint8Array {
  const buffer = new Uint8Array(120);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(8 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(24, msg.x, true);
  view.setFloat32(28, msg.y, true);
  view.setFloat32(32, msg.z, true);
  // Array: covariance
  for (let i = 0; i < 21; i++) {
    view.setFloat32(36 + i * 4, msg.covariance[i] ?? 0, true);
  }

  return buffer;
}

export function deserializeAttPosMocap(payload: Uint8Array): AttPosMocap {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(8 + i * 4, true)),
    x: view.getFloat32(24, true),
    y: view.getFloat32(28, true),
    z: view.getFloat32(32, true),
    covariance: Array.from({ length: 21 }, (_, i) => view.getFloat32(36 + i * 4, true)),
  };
}