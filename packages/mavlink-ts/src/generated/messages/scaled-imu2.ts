/**
 * The RAW IMU readings for secondary 9DOF sensor setup. This message should contain the scaled values to the described units
 * Message ID: 116
 * CRC Extra: 220
 */
export interface ScaledImu2 {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** X acceleration (mG) */
  xacc: number;
  /** Y acceleration (mG) */
  yacc: number;
  /** Z acceleration (mG) */
  zacc: number;
  /** Angular speed around X axis (mrad/s) */
  xgyro: number;
  /** Angular speed around Y axis (mrad/s) */
  ygyro: number;
  /** Angular speed around Z axis (mrad/s) */
  zgyro: number;
  /** X Magnetic field (mgauss) */
  xmag: number;
  /** Y Magnetic field (mgauss) */
  ymag: number;
  /** Z Magnetic field (mgauss) */
  zmag: number;
  /** Temperature, 0: IMU does not provide temperature values. If the IMU is at 0C it must send 1 (0.01C). (cdegC) */
  temperature: number;
}

export const SCALED_IMU2_ID = 116;
export const SCALED_IMU2_CRC_EXTRA = 220;
export const SCALED_IMU2_MIN_LENGTH = 24;
export const SCALED_IMU2_MAX_LENGTH = 24;

export function serializeScaledImu2(msg: ScaledImu2): Uint8Array {
  const buffer = new Uint8Array(24);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setInt16(4, msg.xacc, true);
  view.setInt16(6, msg.yacc, true);
  view.setInt16(8, msg.zacc, true);
  view.setInt16(10, msg.xgyro, true);
  view.setInt16(12, msg.ygyro, true);
  view.setInt16(14, msg.zgyro, true);
  view.setInt16(16, msg.xmag, true);
  view.setInt16(18, msg.ymag, true);
  view.setInt16(20, msg.zmag, true);
  view.setInt16(22, msg.temperature, true);

  return buffer;
}

export function deserializeScaledImu2(payload: Uint8Array): ScaledImu2 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    xacc: view.getInt16(4, true),
    yacc: view.getInt16(6, true),
    zacc: view.getInt16(8, true),
    xgyro: view.getInt16(10, true),
    ygyro: view.getInt16(12, true),
    zgyro: view.getInt16(14, true),
    xmag: view.getInt16(16, true),
    ymag: view.getInt16(18, true),
    zmag: view.getInt16(20, true),
    temperature: view.getInt16(22, true),
  };
}