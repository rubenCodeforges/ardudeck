/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F7: format
 * Message ID: 175
 * CRC Extra: 171
 */
export interface SerialUdbExtraF7 {
  /** Serial UDB YAWKP_RUDDER Gain for Proporional control of navigation */
  sueYawkpRudder: number;
  /** Serial UDB YAWKD_RUDDER Gain for Rate control of navigation */
  sueYawkdRudder: number;
  /** Serial UDB Extra ROLLKP_RUDDER Gain for Proportional control of roll stabilization */
  sueRollkpRudder: number;
  /** Serial UDB Extra ROLLKD_RUDDER Gain for Rate control of roll stabilization */
  sueRollkdRudder: number;
  /** SERIAL UDB EXTRA Rudder Boost Gain to Manual Control when stabilized */
  sueRudderBoost: number;
  /** Serial UDB Extra Return To Landing - Angle to Pitch Plane Down */
  sueRtlPitchDown: number;
}

export const SERIAL_UDB_EXTRA_F7_ID = 175;
export const SERIAL_UDB_EXTRA_F7_CRC_EXTRA = 171;
export const SERIAL_UDB_EXTRA_F7_MIN_LENGTH = 24;
export const SERIAL_UDB_EXTRA_F7_MAX_LENGTH = 24;

export function serializeSerialUdbExtraF7(msg: SerialUdbExtraF7): Uint8Array {
  const buffer = new Uint8Array(24);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.sueYawkpRudder, true);
  view.setFloat32(4, msg.sueYawkdRudder, true);
  view.setFloat32(8, msg.sueRollkpRudder, true);
  view.setFloat32(12, msg.sueRollkdRudder, true);
  view.setFloat32(16, msg.sueRudderBoost, true);
  view.setFloat32(20, msg.sueRtlPitchDown, true);

  return buffer;
}

export function deserializeSerialUdbExtraF7(payload: Uint8Array): SerialUdbExtraF7 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueYawkpRudder: view.getFloat32(0, true),
    sueYawkdRudder: view.getFloat32(4, true),
    sueRollkpRudder: view.getFloat32(8, true),
    sueRollkdRudder: view.getFloat32(12, true),
    sueRudderBoost: view.getFloat32(16, true),
    sueRtlPitchDown: view.getFloat32(20, true),
  };
}