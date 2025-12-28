/**
 * 100 Hz gimbal torque command telemetry.
 * Message ID: 214
 * CRC Extra: 69
 */
export interface GimbalTorqueCmdReport {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Roll Torque Command. */
  rlTorqueCmd: number;
  /** Elevation Torque Command. */
  elTorqueCmd: number;
  /** Azimuth Torque Command. */
  azTorqueCmd: number;
}

export const GIMBAL_TORQUE_CMD_REPORT_ID = 214;
export const GIMBAL_TORQUE_CMD_REPORT_CRC_EXTRA = 69;
export const GIMBAL_TORQUE_CMD_REPORT_MIN_LENGTH = 8;
export const GIMBAL_TORQUE_CMD_REPORT_MAX_LENGTH = 8;

export function serializeGimbalTorqueCmdReport(msg: GimbalTorqueCmdReport): Uint8Array {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.rlTorqueCmd, true);
  view.setInt16(2, msg.elTorqueCmd, true);
  view.setInt16(4, msg.azTorqueCmd, true);
  buffer[6] = msg.targetSystem & 0xff;
  buffer[7] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeGimbalTorqueCmdReport(payload: Uint8Array): GimbalTorqueCmdReport {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    rlTorqueCmd: view.getInt16(0, true),
    elTorqueCmd: view.getInt16(2, true),
    azTorqueCmd: view.getInt16(4, true),
    targetSystem: payload[6],
    targetComponent: payload[7],
  };
}