/**
 * High level message to control a gimbal's attitude. This message is to be sent to the gimbal manager (e.g. from a ground station). Angles and rates can be set to NaN according to use case.
 * Message ID: 282
 * CRC Extra: 123
 */
export interface GimbalManagerSetAttitude {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** High level gimbal manager flags to use. */
  flags: number;
  /** Component ID of gimbal device to address (or 1-6 for non-MAVLink gimbal), 0 for all gimbal device components. Send command multiple times for more than one gimbal (but not all gimbals). */
  gimbalDeviceId: number;
  /** Quaternion components, w, x, y, z (1 0 0 0 is the null-rotation, the frame is depends on whether the flag GIMBAL_MANAGER_FLAGS_YAW_LOCK is set) */
  q: number[];
  /** X component of angular velocity, positive is rolling to the right, NaN to be ignored. (rad/s) */
  angularVelocityX: number;
  /** Y component of angular velocity, positive is pitching up, NaN to be ignored. (rad/s) */
  angularVelocityY: number;
  /** Z component of angular velocity, positive is yawing to the right, NaN to be ignored. (rad/s) */
  angularVelocityZ: number;
}

export const GIMBAL_MANAGER_SET_ATTITUDE_ID = 282;
export const GIMBAL_MANAGER_SET_ATTITUDE_CRC_EXTRA = 123;
export const GIMBAL_MANAGER_SET_ATTITUDE_MIN_LENGTH = 35;
export const GIMBAL_MANAGER_SET_ATTITUDE_MAX_LENGTH = 35;

export function serializeGimbalManagerSetAttitude(msg: GimbalManagerSetAttitude): Uint8Array {
  const buffer = new Uint8Array(35);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.flags, true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(4 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(20, msg.angularVelocityX, true);
  view.setFloat32(24, msg.angularVelocityY, true);
  view.setFloat32(28, msg.angularVelocityZ, true);
  buffer[32] = msg.targetSystem & 0xff;
  buffer[33] = msg.targetComponent & 0xff;
  buffer[34] = msg.gimbalDeviceId & 0xff;

  return buffer;
}

export function deserializeGimbalManagerSetAttitude(payload: Uint8Array): GimbalManagerSetAttitude {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    flags: view.getUint32(0, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(4 + i * 4, true)),
    angularVelocityX: view.getFloat32(20, true),
    angularVelocityY: view.getFloat32(24, true),
    angularVelocityZ: view.getFloat32(28, true),
    targetSystem: payload[32],
    targetComponent: payload[33],
    gimbalDeviceId: payload[34],
  };
}