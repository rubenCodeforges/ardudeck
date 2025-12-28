/**
 * High level message to control a gimbal manually. The angles or angular rates are unitless; the actual rates will depend on internal gimbal manager settings/configuration (e.g. set by parameters). This message is to be sent to the gimbal manager (e.g. from a ground station). Angles and rates can be set to NaN according to use case.
 * Message ID: 288
 * CRC Extra: 20
 */
export interface GimbalManagerSetManualControl {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** High level gimbal manager flags. */
  flags: number;
  /** Component ID of gimbal device to address (or 1-6 for non-MAVLink gimbal), 0 for all gimbal device components. Send command multiple times for more than one gimbal (but not all gimbals). */
  gimbalDeviceId: number;
  /** Pitch angle unitless (-1..1, positive: up, negative: down, NaN to be ignored). */
  pitch: number;
  /** Yaw angle unitless (-1..1, positive: to the right, negative: to the left, NaN to be ignored). */
  yaw: number;
  /** Pitch angular rate unitless (-1..1, positive: up, negative: down, NaN to be ignored). */
  pitchRate: number;
  /** Yaw angular rate unitless (-1..1, positive: to the right, negative: to the left, NaN to be ignored). */
  yawRate: number;
}

export const GIMBAL_MANAGER_SET_MANUAL_CONTROL_ID = 288;
export const GIMBAL_MANAGER_SET_MANUAL_CONTROL_CRC_EXTRA = 20;
export const GIMBAL_MANAGER_SET_MANUAL_CONTROL_MIN_LENGTH = 23;
export const GIMBAL_MANAGER_SET_MANUAL_CONTROL_MAX_LENGTH = 23;

export function serializeGimbalManagerSetManualControl(msg: GimbalManagerSetManualControl): Uint8Array {
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

export function deserializeGimbalManagerSetManualControl(payload: Uint8Array): GimbalManagerSetManualControl {
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