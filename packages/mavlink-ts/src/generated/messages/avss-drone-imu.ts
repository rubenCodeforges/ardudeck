/**
 * Drone IMU data. Quaternion order is w, x, y, z and a zero rotation would be expressed as (1 0 0 0).
 * Message ID: 60052
 * CRC Extra: 101
 */
export interface AvssDroneImu {
  /** Timestamp (time since FC boot). (ms) */
  timeBootMs: number;
  /** Quaternion component 1, w (1 in null-rotation) */
  q1: number;
  /** Quaternion component 2, x (0 in null-rotation) */
  q2: number;
  /** Quaternion component 3, y (0 in null-rotation) */
  q3: number;
  /** Quaternion component 4, z (0 in null-rotation) */
  q4: number;
  /** X acceleration (m/s/s) */
  xacc: number;
  /** Y acceleration (m/s/s) */
  yacc: number;
  /** Z acceleration (m/s/s) */
  zacc: number;
  /** Angular speed around X axis (rad/s) */
  xgyro: number;
  /** Angular speed around Y axis (rad/s) */
  ygyro: number;
  /** Angular speed around Z axis (rad/s) */
  zgyro: number;
}

export const AVSS_DRONE_IMU_ID = 60052;
export const AVSS_DRONE_IMU_CRC_EXTRA = 101;
export const AVSS_DRONE_IMU_MIN_LENGTH = 44;
export const AVSS_DRONE_IMU_MAX_LENGTH = 44;

export function serializeAvssDroneImu(msg: AvssDroneImu): Uint8Array {
  const buffer = new Uint8Array(44);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.q1, true);
  view.setFloat32(8, msg.q2, true);
  view.setFloat32(12, msg.q3, true);
  view.setFloat32(16, msg.q4, true);
  view.setFloat32(20, msg.xacc, true);
  view.setFloat32(24, msg.yacc, true);
  view.setFloat32(28, msg.zacc, true);
  view.setFloat32(32, msg.xgyro, true);
  view.setFloat32(36, msg.ygyro, true);
  view.setFloat32(40, msg.zgyro, true);

  return buffer;
}

export function deserializeAvssDroneImu(payload: Uint8Array): AvssDroneImu {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    q1: view.getFloat32(4, true),
    q2: view.getFloat32(8, true),
    q3: view.getFloat32(12, true),
    q4: view.getFloat32(16, true),
    xacc: view.getFloat32(20, true),
    yacc: view.getFloat32(24, true),
    zacc: view.getFloat32(28, true),
    xgyro: view.getFloat32(32, true),
    ygyro: view.getFloat32(36, true),
    zgyro: view.getFloat32(40, true),
  };
}