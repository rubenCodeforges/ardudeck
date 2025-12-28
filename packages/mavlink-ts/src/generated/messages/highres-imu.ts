/**
 * The IMU readings in SI units in NED body frame
 * Message ID: 105
 * CRC Extra: 253
 */
export interface HighresImu {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** X acceleration (m/s/s) */
  xacc: number;
  /** Y acceleration (m/s/s) */
  yacc: number;
  /** Z acceleration (m/s/s) */
  zacc: number;
  /** Angular speed around X axis (rad/s) */
  xgyro: number;
  /** Angular speed around Y axis (rad/s) */
  ygyro: number;
  /** Angular speed around Z axis (rad/s) */
  zgyro: number;
  /** X Magnetic field (gauss) */
  xmag: number;
  /** Y Magnetic field (gauss) */
  ymag: number;
  /** Z Magnetic field (gauss) */
  zmag: number;
  /** Absolute pressure (hPa) */
  absPressure: number;
  /** Differential pressure (hPa) */
  diffPressure: number;
  /** Altitude calculated from pressure */
  pressureAlt: number;
  /** Temperature (degC) */
  temperature: number;
  /** Bitmap for fields that have updated since last message, bit 0 = xacc, bit 12: temperature */
  fieldsUpdated: number;
  /** Id. Ids are numbered from 0 and map to IMUs numbered from 1 (e.g. IMU1 will have a message with id=0) */
  id: number;
}

export const HIGHRES_IMU_ID = 105;
export const HIGHRES_IMU_CRC_EXTRA = 253;
export const HIGHRES_IMU_MIN_LENGTH = 63;
export const HIGHRES_IMU_MAX_LENGTH = 63;

export function serializeHighresImu(msg: HighresImu): Uint8Array {
  const buffer = new Uint8Array(63);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.xacc, true);
  view.setFloat32(12, msg.yacc, true);
  view.setFloat32(16, msg.zacc, true);
  view.setFloat32(20, msg.xgyro, true);
  view.setFloat32(24, msg.ygyro, true);
  view.setFloat32(28, msg.zgyro, true);
  view.setFloat32(32, msg.xmag, true);
  view.setFloat32(36, msg.ymag, true);
  view.setFloat32(40, msg.zmag, true);
  view.setFloat32(44, msg.absPressure, true);
  view.setFloat32(48, msg.diffPressure, true);
  view.setFloat32(52, msg.pressureAlt, true);
  view.setFloat32(56, msg.temperature, true);
  view.setUint16(60, msg.fieldsUpdated, true);
  buffer[62] = msg.id & 0xff;

  return buffer;
}

export function deserializeHighresImu(payload: Uint8Array): HighresImu {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    xacc: view.getFloat32(8, true),
    yacc: view.getFloat32(12, true),
    zacc: view.getFloat32(16, true),
    xgyro: view.getFloat32(20, true),
    ygyro: view.getFloat32(24, true),
    zgyro: view.getFloat32(28, true),
    xmag: view.getFloat32(32, true),
    ymag: view.getFloat32(36, true),
    zmag: view.getFloat32(40, true),
    absPressure: view.getFloat32(44, true),
    diffPressure: view.getFloat32(48, true),
    pressureAlt: view.getFloat32(52, true),
    temperature: view.getFloat32(56, true),
    fieldsUpdated: view.getUint16(60, true),
    id: payload[62],
  };
}