/**
 * The attitude in the aeronautical frame (right-handed, Z-down, X-front, Y-right), expressed as quaternion. Quaternion order is w, x, y, z and a zero rotation would be expressed as (1 0 0 0).
 * Message ID: 31
 * CRC Extra: 92
 */
export interface AttitudeQuaternion {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Quaternion component 1, w (1 in null-rotation) */
  q1: number;
  /** Quaternion component 2, x (0 in null-rotation) */
  q2: number;
  /** Quaternion component 3, y (0 in null-rotation) */
  q3: number;
  /** Quaternion component 4, z (0 in null-rotation) */
  q4: number;
  /** Roll angular speed (rad/s) */
  rollspeed: number;
  /** Pitch angular speed (rad/s) */
  pitchspeed: number;
  /** Yaw angular speed (rad/s) */
  yawspeed: number;
  /** Rotation offset by which the attitude quaternion and angular speed vector should be rotated for user display (quaternion with [w, x, y, z] order, zero-rotation is [1, 0, 0, 0], send [0, 0, 0, 0] if field not supported). This field is intended for systems in which the reference attitude may change during flight. For example, tailsitters VTOLs rotate their reference attitude by 90 degrees between hover mode and fixed wing mode, thus repr_offset_q is equal to [1, 0, 0, 0] in hover mode and equal to [0.7071, 0, 0.7071, 0] in fixed wing mode. */
  reprOffsetQ: number[];
}

export const ATTITUDE_QUATERNION_ID = 31;
export const ATTITUDE_QUATERNION_CRC_EXTRA = 92;
export const ATTITUDE_QUATERNION_MIN_LENGTH = 48;
export const ATTITUDE_QUATERNION_MAX_LENGTH = 48;

export function serializeAttitudeQuaternion(msg: AttitudeQuaternion): Uint8Array {
  const buffer = new Uint8Array(48);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.q1, true);
  view.setFloat32(8, msg.q2, true);
  view.setFloat32(12, msg.q3, true);
  view.setFloat32(16, msg.q4, true);
  view.setFloat32(20, msg.rollspeed, true);
  view.setFloat32(24, msg.pitchspeed, true);
  view.setFloat32(28, msg.yawspeed, true);
  // Array: repr_offset_q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(32 + i * 4, msg.reprOffsetQ[i] ?? 0, true);
  }

  return buffer;
}

export function deserializeAttitudeQuaternion(payload: Uint8Array): AttitudeQuaternion {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    q1: view.getFloat32(4, true),
    q2: view.getFloat32(8, true),
    q3: view.getFloat32(12, true),
    q4: view.getFloat32(16, true),
    rollspeed: view.getFloat32(20, true),
    pitchspeed: view.getFloat32(24, true),
    yawspeed: view.getFloat32(28, true),
    reprOffsetQ: Array.from({ length: 4 }, (_, i) => view.getFloat32(32 + i * 4, true)),
  };
}