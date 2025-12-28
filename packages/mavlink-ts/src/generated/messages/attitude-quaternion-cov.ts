/**
 * The attitude in the aeronautical frame (right-handed, Z-down, X-front, Y-right), expressed as quaternion. Quaternion order is w, x, y, z and a zero rotation would be expressed as (1 0 0 0).
 * Message ID: 61
 * CRC Extra: 167
 */
export interface AttitudeQuaternionCov {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Quaternion components, w, x, y, z (1 0 0 0 is the null-rotation) */
  q: number[];
  /** Roll angular speed (rad/s) */
  rollspeed: number;
  /** Pitch angular speed (rad/s) */
  pitchspeed: number;
  /** Yaw angular speed (rad/s) */
  yawspeed: number;
  /** Row-major representation of a 3x3 attitude covariance matrix (states: roll, pitch, yaw; first three entries are the first ROW, next three entries are the second row, etc.). If unknown, assign NaN value to first element in the array. */
  covariance: number[];
}

export const ATTITUDE_QUATERNION_COV_ID = 61;
export const ATTITUDE_QUATERNION_COV_CRC_EXTRA = 167;
export const ATTITUDE_QUATERNION_COV_MIN_LENGTH = 72;
export const ATTITUDE_QUATERNION_COV_MAX_LENGTH = 72;

export function serializeAttitudeQuaternionCov(msg: AttitudeQuaternionCov): Uint8Array {
  const buffer = new Uint8Array(72);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(8 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(24, msg.rollspeed, true);
  view.setFloat32(28, msg.pitchspeed, true);
  view.setFloat32(32, msg.yawspeed, true);
  // Array: covariance
  for (let i = 0; i < 9; i++) {
    view.setFloat32(36 + i * 4, msg.covariance[i] ?? 0, true);
  }

  return buffer;
}

export function deserializeAttitudeQuaternionCov(payload: Uint8Array): AttitudeQuaternionCov {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(8 + i * 4, true)),
    rollspeed: view.getFloat32(24, true),
    pitchspeed: view.getFloat32(28, true),
    yawspeed: view.getFloat32(32, true),
    covariance: Array.from({ length: 9 }, (_, i) => view.getFloat32(36 + i * 4, true)),
  };
}