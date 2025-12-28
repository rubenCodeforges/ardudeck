/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F6: format
 * Message ID: 174
 * CRC Extra: 54
 */
export interface SerialUdbExtraF6 {
  /** Serial UDB Extra PITCHGAIN Proportional Control */
  suePitchgain: number;
  /** Serial UDB Extra Pitch Rate Control */
  suePitchkd: number;
  /** Serial UDB Extra Rudder to Elevator Mix */
  sueRudderElevMix: number;
  /** Serial UDB Extra Roll to Elevator Mix */
  sueRollElevMix: number;
  /** Gain For Boosting Manual Elevator control When Plane Stabilized */
  sueElevatorBoost: number;
}

export const SERIAL_UDB_EXTRA_F6_ID = 174;
export const SERIAL_UDB_EXTRA_F6_CRC_EXTRA = 54;
export const SERIAL_UDB_EXTRA_F6_MIN_LENGTH = 20;
export const SERIAL_UDB_EXTRA_F6_MAX_LENGTH = 20;

export function serializeSerialUdbExtraF6(msg: SerialUdbExtraF6): Uint8Array {
  const buffer = new Uint8Array(20);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.suePitchgain, true);
  view.setFloat32(4, msg.suePitchkd, true);
  view.setFloat32(8, msg.sueRudderElevMix, true);
  view.setFloat32(12, msg.sueRollElevMix, true);
  view.setFloat32(16, msg.sueElevatorBoost, true);

  return buffer;
}

export function deserializeSerialUdbExtraF6(payload: Uint8Array): SerialUdbExtraF6 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    suePitchgain: view.getFloat32(0, true),
    suePitchkd: view.getFloat32(4, true),
    sueRudderElevMix: view.getFloat32(8, true),
    sueRollElevMix: view.getFloat32(12, true),
    sueElevatorBoost: view.getFloat32(16, true),
  };
}