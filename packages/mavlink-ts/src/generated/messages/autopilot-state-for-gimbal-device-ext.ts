/**
 * Addition to message AUTOPILOT_STATE_FOR_GIMBAL_DEVICE.
 * Message ID: 60000
 * CRC Extra: 4
 */
export interface AutopilotStateForGimbalDeviceExt {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Timestamp (time since system boot). (us) */
  timeBootUs: bigint;
  /** Wind X speed in NED (North,Est, Down). NAN if unknown. (m/s) */
  windX: number;
  /** Wind Y speed in NED (North, East, Down). NAN if unknown. (m/s) */
  windY: number;
  /** Correction angle due to wind. NaN if unknown. (rad) */
  windCorrectionAngle: number;
}

export const AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_EXT_ID = 60000;
export const AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_EXT_CRC_EXTRA = 4;
export const AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_EXT_MIN_LENGTH = 22;
export const AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_EXT_MAX_LENGTH = 22;

export function serializeAutopilotStateForGimbalDeviceExt(msg: AutopilotStateForGimbalDeviceExt): Uint8Array {
  const buffer = new Uint8Array(22);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeBootUs), true);
  view.setFloat32(8, msg.windX, true);
  view.setFloat32(12, msg.windY, true);
  view.setFloat32(16, msg.windCorrectionAngle, true);
  buffer[20] = msg.targetSystem & 0xff;
  buffer[21] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeAutopilotStateForGimbalDeviceExt(payload: Uint8Array): AutopilotStateForGimbalDeviceExt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootUs: view.getBigUint64(0, true),
    windX: view.getFloat32(8, true),
    windY: view.getFloat32(12, true),
    windCorrectionAngle: view.getFloat32(16, true),
    targetSystem: payload[20],
    targetComponent: payload[21],
  };
}