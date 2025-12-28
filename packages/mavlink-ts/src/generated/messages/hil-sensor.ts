/**
 * The IMU readings in SI units in NED body frame
 * Message ID: 107
 * CRC Extra: 207
 */
export interface HilSensor {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** X acceleration (m/s/s) */
  xacc: number;
  /** Y acceleration (m/s/s) */
  yacc: number;
  /** Z acceleration (m/s/s) */
  zacc: number;
  /** Angular speed around X axis in body frame (rad/s) */
  xgyro: number;
  /** Angular speed around Y axis in body frame (rad/s) */
  ygyro: number;
  /** Angular speed around Z axis in body frame (rad/s) */
  zgyro: number;
  /** X Magnetic field (gauss) */
  xmag: number;
  /** Y Magnetic field (gauss) */
  ymag: number;
  /** Z Magnetic field (gauss) */
  zmag: number;
  /** Absolute pressure (hPa) */
  absPressure: number;
  /** Differential pressure (airspeed) (hPa) */
  diffPressure: number;
  /** Altitude calculated from pressure */
  pressureAlt: number;
  /** Temperature (degC) */
  temperature: number;
  /** Bitmap for fields that have updated since last message, bit 0 = xacc, bit 12: temperature, bit 31: full reset of attitude/position/velocities/etc was performed in sim. */
  fieldsUpdated: number;
  /** Sensor ID (zero indexed). Used for multiple sensor inputs */
  id: number;
}

export const HIL_SENSOR_ID = 107;
export const HIL_SENSOR_CRC_EXTRA = 207;
export const HIL_SENSOR_MIN_LENGTH = 65;
export const HIL_SENSOR_MAX_LENGTH = 65;

export function serializeHilSensor(msg: HilSensor): Uint8Array {
  const buffer = new Uint8Array(65);
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
  view.setUint32(60, msg.fieldsUpdated, true);
  buffer[64] = msg.id & 0xff;

  return buffer;
}

export function deserializeHilSensor(payload: Uint8Array): HilSensor {
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
    fieldsUpdated: view.getUint32(60, true),
    id: payload[64],
  };
}