/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F14: format
 * Message ID: 178
 * CRC Extra: 123
 */
export interface SerialUdbExtraF14 {
  /** Serial UDB Extra Wind Estimation Enabled */
  sueWindEstimation: number;
  /** Serial UDB Extra Type of GPS Unit */
  sueGpsType: number;
  /** Serial UDB Extra Dead Reckoning Enabled */
  sueDr: number;
  /** Serial UDB Extra Type of UDB Hardware */
  sueBoardType: number;
  /** Serial UDB Extra Type of Airframe */
  sueAirframe: number;
  /** Serial UDB Extra Reboot Register of DSPIC */
  sueRcon: number;
  /** Serial UDB Extra  Last dspic Trap Flags */
  sueTrapFlags: number;
  /** Serial UDB Extra Type Program Address of Last Trap */
  sueTrapSource: number;
  /** Serial UDB Extra Number of Ocillator Failures */
  sueOscFailCount: number;
  /** Serial UDB Extra UDB Internal Clock Configuration */
  sueClockConfig: number;
  /** Serial UDB Extra Type of Flight Plan */
  sueFlightPlanType: number;
}

export const SERIAL_UDB_EXTRA_F14_ID = 178;
export const SERIAL_UDB_EXTRA_F14_CRC_EXTRA = 123;
export const SERIAL_UDB_EXTRA_F14_MIN_LENGTH = 17;
export const SERIAL_UDB_EXTRA_F14_MAX_LENGTH = 17;

export function serializeSerialUdbExtraF14(msg: SerialUdbExtraF14): Uint8Array {
  const buffer = new Uint8Array(17);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.sueTrapSource, true);
  view.setInt16(4, msg.sueRcon, true);
  view.setInt16(6, msg.sueTrapFlags, true);
  view.setInt16(8, msg.sueOscFailCount, true);
  buffer[10] = msg.sueWindEstimation & 0xff;
  buffer[11] = msg.sueGpsType & 0xff;
  buffer[12] = msg.sueDr & 0xff;
  buffer[13] = msg.sueBoardType & 0xff;
  buffer[14] = msg.sueAirframe & 0xff;
  buffer[15] = msg.sueClockConfig & 0xff;
  buffer[16] = msg.sueFlightPlanType & 0xff;

  return buffer;
}

export function deserializeSerialUdbExtraF14(payload: Uint8Array): SerialUdbExtraF14 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueTrapSource: view.getUint32(0, true),
    sueRcon: view.getInt16(4, true),
    sueTrapFlags: view.getInt16(6, true),
    sueOscFailCount: view.getInt16(8, true),
    sueWindEstimation: payload[10],
    sueGpsType: payload[11],
    sueDr: payload[12],
    sueBoardType: payload[13],
    sueAirframe: payload[14],
    sueClockConfig: payload[15],
    sueFlightPlanType: payload[16],
  };
}