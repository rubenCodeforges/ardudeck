/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F13: format
 * Message ID: 177
 * CRC Extra: 249
 */
export interface SerialUdbExtraF13 {
  /** Serial UDB Extra GPS Week Number */
  sueWeekNo: number;
  /** Serial UDB Extra MP Origin Latitude */
  sueLatOrigin: number;
  /** Serial UDB Extra MP Origin Longitude */
  sueLonOrigin: number;
  /** Serial UDB Extra MP Origin Altitude Above Sea Level */
  sueAltOrigin: number;
}

export const SERIAL_UDB_EXTRA_F13_ID = 177;
export const SERIAL_UDB_EXTRA_F13_CRC_EXTRA = 249;
export const SERIAL_UDB_EXTRA_F13_MIN_LENGTH = 14;
export const SERIAL_UDB_EXTRA_F13_MAX_LENGTH = 14;

export function serializeSerialUdbExtraF13(msg: SerialUdbExtraF13): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.sueLatOrigin, true);
  view.setInt32(4, msg.sueLonOrigin, true);
  view.setInt32(8, msg.sueAltOrigin, true);
  view.setInt16(12, msg.sueWeekNo, true);

  return buffer;
}

export function deserializeSerialUdbExtraF13(payload: Uint8Array): SerialUdbExtraF13 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueLatOrigin: view.getInt32(0, true),
    sueLonOrigin: view.getInt32(4, true),
    sueAltOrigin: view.getInt32(8, true),
    sueWeekNo: view.getInt16(12, true),
  };
}