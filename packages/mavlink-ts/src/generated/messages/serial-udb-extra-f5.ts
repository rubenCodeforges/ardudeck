/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F5: format
 * Message ID: 173
 * CRC Extra: 54
 */
export interface SerialUdbExtraF5 {
  /** Serial UDB YAWKP_AILERON Gain for Proporional control of navigation */
  sueYawkpAileron: number;
  /** Serial UDB YAWKD_AILERON Gain for Rate control of navigation */
  sueYawkdAileron: number;
  /** Serial UDB Extra ROLLKP Gain for Proportional control of roll stabilization */
  sueRollkp: number;
  /** Serial UDB Extra ROLLKD Gain for Rate control of roll stabilization */
  sueRollkd: number;
}

export const SERIAL_UDB_EXTRA_F5_ID = 173;
export const SERIAL_UDB_EXTRA_F5_CRC_EXTRA = 54;
export const SERIAL_UDB_EXTRA_F5_MIN_LENGTH = 16;
export const SERIAL_UDB_EXTRA_F5_MAX_LENGTH = 16;

export function serializeSerialUdbExtraF5(msg: SerialUdbExtraF5): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.sueYawkpAileron, true);
  view.setFloat32(4, msg.sueYawkdAileron, true);
  view.setFloat32(8, msg.sueRollkp, true);
  view.setFloat32(12, msg.sueRollkd, true);

  return buffer;
}

export function deserializeSerialUdbExtraF5(payload: Uint8Array): SerialUdbExtraF5 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueYawkpAileron: view.getFloat32(0, true),
    sueYawkdAileron: view.getFloat32(4, true),
    sueRollkp: view.getFloat32(8, true),
    sueRollkd: view.getFloat32(12, true),
  };
}