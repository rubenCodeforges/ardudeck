/**
 * Information about a gimbal manager. This message should be requested by a ground station using MAV_CMD_REQUEST_MESSAGE. It mirrors some fields of the GIMBAL_DEVICE_INFORMATION message, but not all. If the additional information is desired, also GIMBAL_DEVICE_INFORMATION should be requested.
 * Message ID: 60010
 * CRC Extra: 208
 */
export interface Storm32GimbalManagerInformation {
  /** Gimbal ID (component ID or 1-6 for non-MAVLink gimbal) that this gimbal manager is responsible for. */
  gimbalId: number;
  /** Gimbal device capability flags. Same flags as reported by GIMBAL_DEVICE_INFORMATION. The flag is only 16 bit wide, but stored in 32 bit, for backwards compatibility (high word is zero). */
  deviceCapFlags: number;
  /** Gimbal manager capability flags. */
  managerCapFlags: number;
  /** Hardware minimum roll angle (positive: roll to the right). NaN if unknown. (rad) */
  rollMin: number;
  /** Hardware maximum roll angle (positive: roll to the right). NaN if unknown. (rad) */
  rollMax: number;
  /** Hardware minimum pitch/tilt angle (positive: tilt up). NaN if unknown. (rad) */
  pitchMin: number;
  /** Hardware maximum pitch/tilt angle (positive: tilt up). NaN if unknown. (rad) */
  pitchMax: number;
  /** Hardware minimum yaw/pan angle (positive: pan to the right, relative to the vehicle/gimbal base). NaN if unknown. (rad) */
  yawMin: number;
  /** Hardware maximum yaw/pan angle (positive: pan to the right, relative to the vehicle/gimbal base). NaN if unknown. (rad) */
  yawMax: number;
}

export const STORM32_GIMBAL_MANAGER_INFORMATION_ID = 60010;
export const STORM32_GIMBAL_MANAGER_INFORMATION_CRC_EXTRA = 208;
export const STORM32_GIMBAL_MANAGER_INFORMATION_MIN_LENGTH = 33;
export const STORM32_GIMBAL_MANAGER_INFORMATION_MAX_LENGTH = 33;

export function serializeStorm32GimbalManagerInformation(msg: Storm32GimbalManagerInformation): Uint8Array {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.deviceCapFlags, true);
  view.setUint32(4, msg.managerCapFlags, true);
  view.setFloat32(8, msg.rollMin, true);
  view.setFloat32(12, msg.rollMax, true);
  view.setFloat32(16, msg.pitchMin, true);
  view.setFloat32(20, msg.pitchMax, true);
  view.setFloat32(24, msg.yawMin, true);
  view.setFloat32(28, msg.yawMax, true);
  buffer[32] = msg.gimbalId & 0xff;

  return buffer;
}

export function deserializeStorm32GimbalManagerInformation(payload: Uint8Array): Storm32GimbalManagerInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    deviceCapFlags: view.getUint32(0, true),
    managerCapFlags: view.getUint32(4, true),
    rollMin: view.getFloat32(8, true),
    rollMax: view.getFloat32(12, true),
    pitchMin: view.getFloat32(16, true),
    pitchMax: view.getFloat32(20, true),
    yawMin: view.getFloat32(24, true),
    yawMax: view.getFloat32(28, true),
    gimbalId: payload[32],
  };
}