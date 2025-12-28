/**
 * Message to a gimbal manager to control the gimbal attitude. Angles and rates can be set to NaN according to use case. A gimbal device is never to react to this message.
 * Message ID: 60012
 * CRC Extra: 99
 */
export interface Storm32GimbalManagerControl {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Gimbal ID of the gimbal manager to address (component ID or 1-6 for non-MAVLink gimbal, 0 for all gimbals). Send command multiple times for more than one but not all gimbals. */
  gimbalId: number;
  /** Client which is contacting the gimbal manager (must be set). */
  client: number;
  /** Gimbal device flags to be applied (UINT16_MAX to be ignored). Same flags as used in GIMBAL_DEVICE_SET_ATTITUDE. */
  deviceFlags: number;
  /** Gimbal manager flags to be applied (0 to be ignored). */
  managerFlags: number;
  /** Quaternion components, w, x, y, z (1 0 0 0 is the null-rotation). Set first element to NaN to be ignored. The frame is determined by the GIMBAL_DEVICE_FLAGS_YAW_IN_xxx_FRAME flags. */
  q: number[];
  /** X component of angular velocity (positive: roll to the right). NaN to be ignored. (rad/s) */
  angularVelocityX: number;
  /** Y component of angular velocity (positive: tilt up). NaN to be ignored. (rad/s) */
  angularVelocityY: number;
  /** Z component of angular velocity (positive: pan to the right). NaN to be ignored. The frame is determined by the GIMBAL_DEVICE_FLAGS_YAW_IN_xxx_FRAME flags. (rad/s) */
  angularVelocityZ: number;
}

export const STORM32_GIMBAL_MANAGER_CONTROL_ID = 60012;
export const STORM32_GIMBAL_MANAGER_CONTROL_CRC_EXTRA = 99;
export const STORM32_GIMBAL_MANAGER_CONTROL_MIN_LENGTH = 36;
export const STORM32_GIMBAL_MANAGER_CONTROL_MAX_LENGTH = 36;

export function serializeStorm32GimbalManagerControl(msg: Storm32GimbalManagerControl): Uint8Array {
  const buffer = new Uint8Array(36);
  const view = new DataView(buffer.buffer);

  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(0 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(16, msg.angularVelocityX, true);
  view.setFloat32(20, msg.angularVelocityY, true);
  view.setFloat32(24, msg.angularVelocityZ, true);
  view.setUint16(28, msg.deviceFlags, true);
  view.setUint16(30, msg.managerFlags, true);
  buffer[32] = msg.targetSystem & 0xff;
  buffer[33] = msg.targetComponent & 0xff;
  buffer[34] = msg.gimbalId & 0xff;
  buffer[35] = msg.client & 0xff;

  return buffer;
}

export function deserializeStorm32GimbalManagerControl(payload: Uint8Array): Storm32GimbalManagerControl {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(0 + i * 4, true)),
    angularVelocityX: view.getFloat32(16, true),
    angularVelocityY: view.getFloat32(20, true),
    angularVelocityZ: view.getFloat32(24, true),
    deviceFlags: view.getUint16(28, true),
    managerFlags: view.getUint16(30, true),
    targetSystem: payload[32],
    targetComponent: payload[33],
    gimbalId: payload[34],
    client: payload[35],
  };
}