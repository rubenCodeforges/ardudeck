/**
 * Message to a gimbal manager to control the gimbal tilt and pan angles. Angles and rates can be set to NaN according to use case. A gimbal device is never to react to this message.
 * Message ID: 60013
 * CRC Extra: 129
 */
export interface Storm32GimbalManagerControlPitchyaw {
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
  /** Pitch/tilt angle (positive: tilt up). NaN to be ignored. (rad) */
  pitch: number;
  /** Yaw/pan angle (positive: pan the right). NaN to be ignored. The frame is determined by the GIMBAL_DEVICE_FLAGS_YAW_IN_xxx_FRAME flags. (rad) */
  yaw: number;
  /** Pitch/tilt angular rate (positive: tilt up). NaN to be ignored. (rad/s) */
  pitchRate: number;
  /** Yaw/pan angular rate (positive: pan to the right). NaN to be ignored. The frame is determined by the GIMBAL_DEVICE_FLAGS_YAW_IN_xxx_FRAME flags. (rad/s) */
  yawRate: number;
}

export const STORM32_GIMBAL_MANAGER_CONTROL_PITCHYAW_ID = 60013;
export const STORM32_GIMBAL_MANAGER_CONTROL_PITCHYAW_CRC_EXTRA = 129;
export const STORM32_GIMBAL_MANAGER_CONTROL_PITCHYAW_MIN_LENGTH = 24;
export const STORM32_GIMBAL_MANAGER_CONTROL_PITCHYAW_MAX_LENGTH = 24;

export function serializeStorm32GimbalManagerControlPitchyaw(msg: Storm32GimbalManagerControlPitchyaw): Uint8Array {
  const buffer = new Uint8Array(24);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.pitch, true);
  view.setFloat32(4, msg.yaw, true);
  view.setFloat32(8, msg.pitchRate, true);
  view.setFloat32(12, msg.yawRate, true);
  view.setUint16(16, msg.deviceFlags, true);
  view.setUint16(18, msg.managerFlags, true);
  buffer[20] = msg.targetSystem & 0xff;
  buffer[21] = msg.targetComponent & 0xff;
  buffer[22] = msg.gimbalId & 0xff;
  buffer[23] = msg.client & 0xff;

  return buffer;
}

export function deserializeStorm32GimbalManagerControlPitchyaw(payload: Uint8Array): Storm32GimbalManagerControlPitchyaw {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    pitch: view.getFloat32(0, true),
    yaw: view.getFloat32(4, true),
    pitchRate: view.getFloat32(8, true),
    yawRate: view.getFloat32(12, true),
    deviceFlags: view.getUint16(16, true),
    managerFlags: view.getUint16(18, true),
    targetSystem: payload[20],
    targetComponent: payload[21],
    gimbalId: payload[22],
    client: payload[23],
  };
}