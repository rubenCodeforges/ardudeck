/**
 * The RAW IMU readings for a 9DOF sensor, which is identified by the id (default IMU1). This message should always contain the true raw values without any scaling to allow data capture and system debugging. On ArduPilot platforms, this message is identical to SCALED_IMU. By default, only RAW_IMU is sent via telemetry for historical reasons, SCALED_IMU can be requested.
 * Message ID: 27
 * CRC Extra: 83
 */
export interface RawImu {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** X acceleration (raw) (mG) */
  xacc: number;
  /** Y acceleration (raw) (mG) */
  yacc: number;
  /** Z acceleration (raw) (mG) */
  zacc: number;
  /** Angular speed around X axis (raw) (mrad/s) */
  xgyro: number;
  /** Angular speed around Y axis (raw) (mrad/s) */
  ygyro: number;
  /** Angular speed around Z axis (raw) (mrad/s) */
  zgyro: number;
  /** X Magnetic field (raw) (mgauss) */
  xmag: number;
  /** Y Magnetic field (raw) (mgauss) */
  ymag: number;
  /** Z Magnetic field (raw) (mgauss) */
  zmag: number;
  /** Id. Ids are numbered from 0 and map to IMUs numbered from 1 (e.g. IMU1 will have a message with id=0) */
  id: number;
  /** Temperature, 0: IMU does not provide temperature values. If the IMU is at 0C it must send 1 (0.01C). (cdegC) */
  temperature: number;
}

export const RAW_IMU_ID = 27;
export const RAW_IMU_CRC_EXTRA = 83;
export const RAW_IMU_MIN_LENGTH = 29;
export const RAW_IMU_MAX_LENGTH = 29;

export function serializeRawImu(msg: RawImu): Uint8Array {
  const buffer = new Uint8Array(29);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt16(8, msg.xacc, true);
  view.setInt16(10, msg.yacc, true);
  view.setInt16(12, msg.zacc, true);
  view.setInt16(14, msg.xgyro, true);
  view.setInt16(16, msg.ygyro, true);
  view.setInt16(18, msg.zgyro, true);
  view.setInt16(20, msg.xmag, true);
  view.setInt16(22, msg.ymag, true);
  view.setInt16(24, msg.zmag, true);
  view.setInt16(26, msg.temperature, true);
  buffer[28] = msg.id & 0xff;

  return buffer;
}

export function deserializeRawImu(payload: Uint8Array): RawImu {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    xacc: view.getInt16(8, true),
    yacc: view.getInt16(10, true),
    zacc: view.getInt16(12, true),
    xgyro: view.getInt16(14, true),
    ygyro: view.getInt16(16, true),
    zgyro: view.getInt16(18, true),
    xmag: view.getInt16(20, true),
    ymag: view.getInt16(22, true),
    zmag: view.getInt16(24, true),
    temperature: view.getInt16(26, true),
    id: payload[28],
  };
}