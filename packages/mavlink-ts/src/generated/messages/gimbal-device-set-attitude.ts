/**
 * Low level message to control a gimbal device's attitude.
	  This message is to be sent from the gimbal manager to the gimbal device component.
	  The quaternion and angular velocities can be set to NaN according to use case.
	  For the angles encoded in the quaternion and the angular velocities holds:
	  If the flag GIMBAL_DEVICE_FLAGS_YAW_IN_VEHICLE_FRAME is set, then they are relative to the vehicle heading (vehicle frame).
	  If the flag GIMBAL_DEVICE_FLAGS_YAW_IN_EARTH_FRAME is set, then they are relative to absolute North (earth frame).
	  If neither of these flags are set, then (for backwards compatibility) it holds:
	  If the flag GIMBAL_DEVICE_FLAGS_YAW_LOCK is set, then they are relative to absolute North (earth frame),
	  else they are relative to the vehicle heading (vehicle frame).
	  Setting both GIMBAL_DEVICE_FLAGS_YAW_IN_VEHICLE_FRAME and GIMBAL_DEVICE_FLAGS_YAW_IN_EARTH_FRAME is not allowed.
	  These rules are to ensure backwards compatibility.
	  New implementations should always set either GIMBAL_DEVICE_FLAGS_YAW_IN_VEHICLE_FRAME or GIMBAL_DEVICE_FLAGS_YAW_IN_EARTH_FRAME.
 * Message ID: 284
 * CRC Extra: 99
 */
export interface GimbalDeviceSetAttitude {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Low level gimbal flags. */
  flags: number;
  /** Quaternion components, w, x, y, z (1 0 0 0 is the null-rotation). The frame is described in the message description. Set fields to NaN to be ignored. */
  q: number[];
  /** X component of angular velocity (positive: rolling to the right). The frame is described in the message description. NaN to be ignored. (rad/s) */
  angularVelocityX: number;
  /** Y component of angular velocity (positive: pitching up). The frame is described in the message description. NaN to be ignored. (rad/s) */
  angularVelocityY: number;
  /** Z component of angular velocity (positive: yawing to the right). The frame is described in the message description. NaN to be ignored. (rad/s) */
  angularVelocityZ: number;
}

export const GIMBAL_DEVICE_SET_ATTITUDE_ID = 284;
export const GIMBAL_DEVICE_SET_ATTITUDE_CRC_EXTRA = 99;
export const GIMBAL_DEVICE_SET_ATTITUDE_MIN_LENGTH = 32;
export const GIMBAL_DEVICE_SET_ATTITUDE_MAX_LENGTH = 32;

export function serializeGimbalDeviceSetAttitude(msg: GimbalDeviceSetAttitude): Uint8Array {
  const buffer = new Uint8Array(32);
  const view = new DataView(buffer.buffer);

  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(0 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(16, msg.angularVelocityX, true);
  view.setFloat32(20, msg.angularVelocityY, true);
  view.setFloat32(24, msg.angularVelocityZ, true);
  view.setUint16(28, msg.flags, true);
  buffer[30] = msg.targetSystem & 0xff;
  buffer[31] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeGimbalDeviceSetAttitude(payload: Uint8Array): GimbalDeviceSetAttitude {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(0 + i * 4, true)),
    angularVelocityX: view.getFloat32(16, true),
    angularVelocityY: view.getFloat32(20, true),
    angularVelocityZ: view.getFloat32(24, true),
    flags: view.getUint16(28, true),
    targetSystem: payload[30],
    targetComponent: payload[31],
  };
}