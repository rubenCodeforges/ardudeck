/**
 * Status of simulation environment, if used.
 * Message ID: 164
 * CRC Extra: 154
 */
export interface Simstate {
  /** Roll angle. (rad) */
  roll: number;
  /** Pitch angle. (rad) */
  pitch: number;
  /** Yaw angle. (rad) */
  yaw: number;
  /** X acceleration. (m/s/s) */
  xacc: number;
  /** Y acceleration. (m/s/s) */
  yacc: number;
  /** Z acceleration. (m/s/s) */
  zacc: number;
  /** Angular speed around X axis. (rad/s) */
  xgyro: number;
  /** Angular speed around Y axis. (rad/s) */
  ygyro: number;
  /** Angular speed around Z axis. (rad/s) */
  zgyro: number;
  /** Latitude. (degE7) */
  lat: number;
  /** Longitude. (degE7) */
  lng: number;
}

export const SIMSTATE_ID = 164;
export const SIMSTATE_CRC_EXTRA = 154;
export const SIMSTATE_MIN_LENGTH = 44;
export const SIMSTATE_MAX_LENGTH = 44;

export function serializeSimstate(msg: Simstate): Uint8Array {
  const buffer = new Uint8Array(44);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.roll, true);
  view.setFloat32(4, msg.pitch, true);
  view.setFloat32(8, msg.yaw, true);
  view.setFloat32(12, msg.xacc, true);
  view.setFloat32(16, msg.yacc, true);
  view.setFloat32(20, msg.zacc, true);
  view.setFloat32(24, msg.xgyro, true);
  view.setFloat32(28, msg.ygyro, true);
  view.setFloat32(32, msg.zgyro, true);
  view.setInt32(36, msg.lat, true);
  view.setInt32(40, msg.lng, true);

  return buffer;
}

export function deserializeSimstate(payload: Uint8Array): Simstate {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    roll: view.getFloat32(0, true),
    pitch: view.getFloat32(4, true),
    yaw: view.getFloat32(8, true),
    xacc: view.getFloat32(12, true),
    yacc: view.getFloat32(16, true),
    zacc: view.getFloat32(20, true),
    xgyro: view.getFloat32(24, true),
    ygyro: view.getFloat32(28, true),
    zgyro: view.getFloat32(32, true),
    lat: view.getInt32(36, true),
    lng: view.getInt32(40, true),
  };
}