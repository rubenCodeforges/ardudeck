/**
 * The attitude in the aeronautical frame (right-handed, Z-down, Y-right, X-front, ZYX, intrinsic).
 * Message ID: 30
 * CRC Extra: 39
 */
export interface Attitude {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Roll angle (-pi..+pi) (rad) */
  roll: number;
  /** Pitch angle (-pi..+pi) (rad) */
  pitch: number;
  /** Yaw angle (-pi..+pi) (rad) */
  yaw: number;
  /** Roll angular speed (rad/s) */
  rollspeed: number;
  /** Pitch angular speed (rad/s) */
  pitchspeed: number;
  /** Yaw angular speed (rad/s) */
  yawspeed: number;
}

export const ATTITUDE_ID = 30;
export const ATTITUDE_CRC_EXTRA = 39;
export const ATTITUDE_MIN_LENGTH = 28;
export const ATTITUDE_MAX_LENGTH = 28;

export function serializeAttitude(msg: Attitude): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.roll, true);
  view.setFloat32(8, msg.pitch, true);
  view.setFloat32(12, msg.yaw, true);
  view.setFloat32(16, msg.rollspeed, true);
  view.setFloat32(20, msg.pitchspeed, true);
  view.setFloat32(24, msg.yawspeed, true);

  return buffer;
}

export function deserializeAttitude(payload: Uint8Array): Attitude {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    roll: view.getFloat32(4, true),
    pitch: view.getFloat32(8, true),
    yaw: view.getFloat32(12, true),
    rollspeed: view.getFloat32(16, true),
    pitchspeed: view.getFloat32(20, true),
    yawspeed: view.getFloat32(24, true),
  };
}