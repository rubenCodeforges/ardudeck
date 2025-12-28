/**
 * Message reporting the status of a gimbal device.
	  This message should be broadcast by a gimbal device component at a low regular rate (e.g. 5 Hz).
	  For the angles encoded in the quaternion and the angular velocities holds:
	  If the flag GIMBAL_DEVICE_FLAGS_YAW_IN_VEHICLE_FRAME is set, then they are relative to the vehicle heading (vehicle frame).
	  If the flag GIMBAL_DEVICE_FLAGS_YAW_IN_EARTH_FRAME is set, then they are relative to absolute North (earth frame).
	  If neither of these flags are set, then (for backwards compatibility) it holds:
	  If the flag GIMBAL_DEVICE_FLAGS_YAW_LOCK is set, then they are relative to absolute North (earth frame),
	  else they are relative to the vehicle heading (vehicle frame).
	  Other conditions of the flags are not allowed.
	  The quaternion and angular velocities in the other frame can be calculated from delta_yaw and delta_yaw_velocity as
	  q_earth = q_delta_yaw * q_vehicle and w_earth = w_delta_yaw_velocity + w_vehicle (if not NaN).
	  If neither the GIMBAL_DEVICE_FLAGS_YAW_IN_VEHICLE_FRAME nor the GIMBAL_DEVICE_FLAGS_YAW_IN_EARTH_FRAME flag is set,
	  then (for backwards compatibility) the data in the delta_yaw and delta_yaw_velocity fields are to be ignored.
	  New implementations should always set either GIMBAL_DEVICE_FLAGS_YAW_IN_VEHICLE_FRAME or GIMBAL_DEVICE_FLAGS_YAW_IN_EARTH_FRAME,
	  and always should set delta_yaw and delta_yaw_velocity either to the proper value or NaN.
 * Message ID: 285
 * CRC Extra: 234
 */
export interface GimbalDeviceAttitudeStatus {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Current gimbal flags set. */
  flags: number;
  /** Quaternion components, w, x, y, z (1 0 0 0 is the null-rotation). The frame is described in the message description. */
  q: number[];
  /** X component of angular velocity (positive: rolling to the right). The frame is described in the message description. NaN if unknown. (rad/s) */
  angularVelocityX: number;
  /** Y component of angular velocity (positive: pitching up). The frame is described in the message description. NaN if unknown. (rad/s) */
  angularVelocityY: number;
  /** Z component of angular velocity (positive: yawing to the right). The frame is described in the message description. NaN if unknown. (rad/s) */
  angularVelocityZ: number;
  /** Failure flags (0 for no failure) */
  failureFlags: number;
  /** Yaw angle relating the quaternions in earth and body frames (see message description). NaN if unknown. (rad) */
  deltaYaw: number;
  /** Yaw angular velocity relating the angular velocities in earth and body frames (see message description). NaN if unknown. (rad/s) */
  deltaYawVelocity: number;
  /** This field is to be used if the gimbal manager and the gimbal device are the same component and hence have the same component ID. This field is then set a number between 1-6. If the component ID is separate, this field is not required and must be set to 0. */
  gimbalDeviceId: number;
}

export const GIMBAL_DEVICE_ATTITUDE_STATUS_ID = 285;
export const GIMBAL_DEVICE_ATTITUDE_STATUS_CRC_EXTRA = 234;
export const GIMBAL_DEVICE_ATTITUDE_STATUS_MIN_LENGTH = 49;
export const GIMBAL_DEVICE_ATTITUDE_STATUS_MAX_LENGTH = 49;

export function serializeGimbalDeviceAttitudeStatus(msg: GimbalDeviceAttitudeStatus): Uint8Array {
  const buffer = new Uint8Array(49);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(4 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(20, msg.angularVelocityX, true);
  view.setFloat32(24, msg.angularVelocityY, true);
  view.setFloat32(28, msg.angularVelocityZ, true);
  view.setUint32(32, msg.failureFlags, true);
  view.setFloat32(36, msg.deltaYaw, true);
  view.setFloat32(40, msg.deltaYawVelocity, true);
  view.setUint16(44, msg.flags, true);
  buffer[46] = msg.targetSystem & 0xff;
  buffer[47] = msg.targetComponent & 0xff;
  buffer[48] = msg.gimbalDeviceId & 0xff;

  return buffer;
}

export function deserializeGimbalDeviceAttitudeStatus(payload: Uint8Array): GimbalDeviceAttitudeStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(4 + i * 4, true)),
    angularVelocityX: view.getFloat32(20, true),
    angularVelocityY: view.getFloat32(24, true),
    angularVelocityZ: view.getFloat32(28, true),
    failureFlags: view.getUint32(32, true),
    deltaYaw: view.getFloat32(36, true),
    deltaYawVelocity: view.getFloat32(40, true),
    flags: view.getUint16(44, true),
    targetSystem: payload[46],
    targetComponent: payload[47],
    gimbalDeviceId: payload[48],
  };
}