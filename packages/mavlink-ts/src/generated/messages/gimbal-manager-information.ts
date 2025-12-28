/**
 * Information about a high level gimbal manager. This message should be requested by a ground station using MAV_CMD_REQUEST_MESSAGE.
 * Message ID: 280
 * CRC Extra: 70
 */
export interface GimbalManagerInformation {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Bitmap of gimbal capability flags. */
  capFlags: number;
  /** Gimbal device ID that this gimbal manager is responsible for. Component ID of gimbal device (or 1-6 for non-MAVLink gimbal). */
  gimbalDeviceId: number;
  /** Minimum hardware roll angle (positive: rolling to the right, negative: rolling to the left) (rad) */
  rollMin: number;
  /** Maximum hardware roll angle (positive: rolling to the right, negative: rolling to the left) (rad) */
  rollMax: number;
  /** Minimum pitch angle (positive: up, negative: down) (rad) */
  pitchMin: number;
  /** Maximum pitch angle (positive: up, negative: down) (rad) */
  pitchMax: number;
  /** Minimum yaw angle (positive: to the right, negative: to the left) (rad) */
  yawMin: number;
  /** Maximum yaw angle (positive: to the right, negative: to the left) (rad) */
  yawMax: number;
}

export const GIMBAL_MANAGER_INFORMATION_ID = 280;
export const GIMBAL_MANAGER_INFORMATION_CRC_EXTRA = 70;
export const GIMBAL_MANAGER_INFORMATION_MIN_LENGTH = 33;
export const GIMBAL_MANAGER_INFORMATION_MAX_LENGTH = 33;

export function serializeGimbalManagerInformation(msg: GimbalManagerInformation): Uint8Array {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint32(4, msg.capFlags, true);
  view.setFloat32(8, msg.rollMin, true);
  view.setFloat32(12, msg.rollMax, true);
  view.setFloat32(16, msg.pitchMin, true);
  view.setFloat32(20, msg.pitchMax, true);
  view.setFloat32(24, msg.yawMin, true);
  view.setFloat32(28, msg.yawMax, true);
  buffer[32] = msg.gimbalDeviceId & 0xff;

  return buffer;
}

export function deserializeGimbalManagerInformation(payload: Uint8Array): GimbalManagerInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    capFlags: view.getUint32(4, true),
    rollMin: view.getFloat32(8, true),
    rollMax: view.getFloat32(12, true),
    pitchMin: view.getFloat32(16, true),
    pitchMax: view.getFloat32(20, true),
    yawMin: view.getFloat32(24, true),
    yawMax: view.getFloat32(28, true),
    gimbalDeviceId: payload[32],
  };
}