/**
 * Backwards compatible version of SERIAL_UDB_EXTRA F22 format
 * Message ID: 188
 * CRC Extra: 91
 */
export interface SerialUdbExtraF22 {
  /** SUE X accelerometer at calibration time */
  sueAccelXAtCalibration: number;
  /** SUE Y accelerometer at calibration time */
  sueAccelYAtCalibration: number;
  /** SUE Z accelerometer at calibration time */
  sueAccelZAtCalibration: number;
  /** SUE X gyro at calibration time */
  sueGyroXAtCalibration: number;
  /** SUE Y gyro at calibration time */
  sueGyroYAtCalibration: number;
  /** SUE Z gyro at calibration time */
  sueGyroZAtCalibration: number;
}

export const SERIAL_UDB_EXTRA_F22_ID = 188;
export const SERIAL_UDB_EXTRA_F22_CRC_EXTRA = 91;
export const SERIAL_UDB_EXTRA_F22_MIN_LENGTH = 12;
export const SERIAL_UDB_EXTRA_F22_MAX_LENGTH = 12;

export function serializeSerialUdbExtraF22(msg: SerialUdbExtraF22): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.sueAccelXAtCalibration, true);
  view.setInt16(2, msg.sueAccelYAtCalibration, true);
  view.setInt16(4, msg.sueAccelZAtCalibration, true);
  view.setInt16(6, msg.sueGyroXAtCalibration, true);
  view.setInt16(8, msg.sueGyroYAtCalibration, true);
  view.setInt16(10, msg.sueGyroZAtCalibration, true);

  return buffer;
}

export function deserializeSerialUdbExtraF22(payload: Uint8Array): SerialUdbExtraF22 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sueAccelXAtCalibration: view.getInt16(0, true),
    sueAccelYAtCalibration: view.getInt16(2, true),
    sueAccelZAtCalibration: view.getInt16(4, true),
    sueGyroXAtCalibration: view.getInt16(6, true),
    sueGyroYAtCalibration: view.getInt16(8, true),
    sueGyroZAtCalibration: view.getInt16(10, true),
  };
}