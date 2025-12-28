/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F21 format
 * Message ID: 187
 * CRC Extra: 134
 */
export interface SerialUdbExtraF21 {
  /** SUE X accelerometer offset */
  sueAccelXOffset: number;
  /** SUE Y accelerometer offset */
  sueAccelYOffset: number;
  /** SUE Z accelerometer offset */
  sueAccelZOffset: number;
  /** SUE X gyro offset */
  sueGyroXOffset: number;
  /** SUE Y gyro offset */
  sueGyroYOffset: number;
  /** SUE Z gyro offset */
  sueGyroZOffset: number;
}

export const SERIAL_UDB_EXTRA_F21_ID = 187;
export const SERIAL_UDB_EXTRA_F21_CRC_EXTRA = 134;
export const SERIAL_UDB_EXTRA_F21_MIN_LENGTH = 12;
export const SERIAL_UDB_EXTRA_F21_MAX_LENGTH = 12;

export function serializeSerialUdbExtraF21(msg: SerialUdbExtraF21): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.sueAccelXOffset, true);
  view.setInt16(2, msg.sueAccelYOffset, true);
  view.setInt16(4, msg.sueAccelZOffset, true);
  view.setInt16(6, msg.sueGyroXOffset, true);
  view.setInt16(8, msg.sueGyroYOffset, true);
  view.setInt16(10, msg.sueGyroZOffset, true);

  return buffer;
}

export function deserializeSerialUdbExtraF21(payload: Uint8Array): SerialUdbExtraF21 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueAccelXOffset: view.getInt16(0, true),
    sueAccelYOffset: view.getInt16(2, true),
    sueAccelZOffset: view.getInt16(4, true),
    sueGyroXOffset: view.getInt16(6, true),
    sueGyroYOffset: view.getInt16(8, true),
    sueGyroZOffset: view.getInt16(10, true),
  };
}