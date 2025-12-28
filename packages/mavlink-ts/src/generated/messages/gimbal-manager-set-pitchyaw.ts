/**
 * Set gimbal manager pitch and yaw angles (high rate message). This message is to be sent to the gimbal manager (e.g. from a ground station) and will be ignored by gimbal devices. Angles and rates can be set to NaN according to use case. Use MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW for low-rate adjustments that require confirmation.
 * Message ID: 287
 * CRC Extra: 1
 */
export interface GimbalManagerSetPitchyaw {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** High level gimbal manager flags to use. */
  flags: number;
  /** Component ID of gimbal device to address (or 1-6 for non-MAVLink gimbal), 0 for all gimbal device components. Send command multiple times for more than one gimbal (but not all gimbals). */
  gimbalDeviceId: number;
  /** Pitch angle (positive: up, negative: down, NaN to be ignored). (rad) */
  pitch: number;
  /** Yaw angle (positive: to the right, negative: to the left, NaN to be ignored). (rad) */
  yaw: number;
  /** Pitch angular rate (positive: up, negative: down, NaN to be ignored). (rad/s) */
  pitchRate: number;
  /** Yaw angular rate (positive: to the right, negative: to the left, NaN to be ignored). (rad/s) */
  yawRate: number;
}

export const GIMBAL_MANAGER_SET_PITCHYAW_ID = 287;
export const GIMBAL_MANAGER_SET_PITCHYAW_CRC_EXTRA = 1;
export const GIMBAL_MANAGER_SET_PITCHYAW_MIN_LENGTH = 23;
export const GIMBAL_MANAGER_SET_PITCHYAW_MAX_LENGTH = 23;

export function serializeGimbalManagerSetPitchyaw(msg: GimbalManagerSetPitchyaw): Uint8Array {
  const buffer = new Uint8Array(23);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.flags, true);
  view.setFloat32(4, msg.pitch, true);
  view.setFloat32(8, msg.yaw, true);
  view.setFloat32(12, msg.pitchRate, true);
  view.setFloat32(16, msg.yawRate, true);
  buffer[20] = msg.targetSystem & 0xff;
  buffer[21] = msg.targetComponent & 0xff;
  buffer[22] = msg.gimbalDeviceId & 0xff;

  return buffer;
}

export function deserializeGimbalManagerSetPitchyaw(payload: Uint8Array): GimbalManagerSetPitchyaw {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    flags: view.getUint32(0, true),
    pitch: view.getFloat32(4, true),
    yaw: view.getFloat32(8, true),
    pitchRate: view.getFloat32(12, true),
    yawRate: view.getFloat32(16, true),
    targetSystem: payload[20],
    targetComponent: payload[21],
    gimbalDeviceId: payload[22],
  };
}