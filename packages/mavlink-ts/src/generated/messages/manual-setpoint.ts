/**
 * Setpoint in roll, pitch, yaw and thrust from the operator
 * Message ID: 81
 * CRC Extra: 106
 */
export interface ManualSetpoint {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Desired roll rate (rad/s) */
  roll: number;
  /** Desired pitch rate (rad/s) */
  pitch: number;
  /** Desired yaw rate (rad/s) */
  yaw: number;
  /** Collective thrust, normalized to 0 .. 1 */
  thrust: number;
  /** Flight mode switch position, 0.. 255 */
  modeSwitch: number;
  /** Override mode switch position, 0.. 255 */
  manualOverrideSwitch: number;
}

export const MANUAL_SETPOINT_ID = 81;
export const MANUAL_SETPOINT_CRC_EXTRA = 106;
export const MANUAL_SETPOINT_MIN_LENGTH = 22;
export const MANUAL_SETPOINT_MAX_LENGTH = 22;

export function serializeManualSetpoint(msg: ManualSetpoint): Uint8Array {
  const buffer = new Uint8Array(22);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.roll, true);
  view.setFloat32(8, msg.pitch, true);
  view.setFloat32(12, msg.yaw, true);
  view.setFloat32(16, msg.thrust, true);
  buffer[20] = msg.modeSwitch & 0xff;
  buffer[21] = msg.manualOverrideSwitch & 0xff;

  return buffer;
}

export function deserializeManualSetpoint(payload: Uint8Array): ManualSetpoint {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    roll: view.getFloat32(4, true),
    pitch: view.getFloat32(8, true),
    yaw: view.getFloat32(12, true),
    thrust: view.getFloat32(16, true),
    modeSwitch: payload[20],
    manualOverrideSwitch: payload[21],
  };
}