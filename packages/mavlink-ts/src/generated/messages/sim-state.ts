/**
 * Status of simulation environment, if used
 * Message ID: 108
 * CRC Extra: 205
 */
export interface SimState {
  /** True attitude quaternion component 1, w (1 in null-rotation) */
  q1: number;
  /** True attitude quaternion component 2, x (0 in null-rotation) */
  q2: number;
  /** True attitude quaternion component 3, y (0 in null-rotation) */
  q3: number;
  /** True attitude quaternion component 4, z (0 in null-rotation) */
  q4: number;
  /** Attitude roll expressed as Euler angles, not recommended except for human-readable outputs */
  roll: number;
  /** Attitude pitch expressed as Euler angles, not recommended except for human-readable outputs */
  pitch: number;
  /** Attitude yaw expressed as Euler angles, not recommended except for human-readable outputs */
  yaw: number;
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
  /** Latitude (deg) */
  lat: number;
  /** Longitude (deg) */
  lon: number;
  /** Altitude (m) */
  alt: number;
  /** Horizontal position standard deviation */
  stdDevHorz: number;
  /** Vertical position standard deviation */
  stdDevVert: number;
  /** True velocity in north direction in earth-fixed NED frame (m/s) */
  vn: number;
  /** True velocity in east direction in earth-fixed NED frame (m/s) */
  ve: number;
  /** True velocity in down direction in earth-fixed NED frame (m/s) */
  vd: number;
  /** Latitude (higher precision). If 0, recipients should use the lat field value (otherwise this field is preferred). (degE7) */
  latInt: number;
  /** Longitude (higher precision). If 0, recipients should use the lon field value (otherwise this field is preferred). (degE7) */
  lonInt: number;
}

export const SIM_STATE_ID = 108;
export const SIM_STATE_CRC_EXTRA = 205;
export const SIM_STATE_MIN_LENGTH = 92;
export const SIM_STATE_MAX_LENGTH = 92;

export function serializeSimState(msg: SimState): Uint8Array {
  const buffer = new Uint8Array(92);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.q1, true);
  view.setFloat32(4, msg.q2, true);
  view.setFloat32(8, msg.q3, true);
  view.setFloat32(12, msg.q4, true);
  view.setFloat32(16, msg.roll, true);
  view.setFloat32(20, msg.pitch, true);
  view.setFloat32(24, msg.yaw, true);
  view.setFloat32(28, msg.xacc, true);
  view.setFloat32(32, msg.yacc, true);
  view.setFloat32(36, msg.zacc, true);
  view.setFloat32(40, msg.xgyro, true);
  view.setFloat32(44, msg.ygyro, true);
  view.setFloat32(48, msg.zgyro, true);
  view.setFloat32(52, msg.lat, true);
  view.setFloat32(56, msg.lon, true);
  view.setFloat32(60, msg.alt, true);
  view.setFloat32(64, msg.stdDevHorz, true);
  view.setFloat32(68, msg.stdDevVert, true);
  view.setFloat32(72, msg.vn, true);
  view.setFloat32(76, msg.ve, true);
  view.setFloat32(80, msg.vd, true);
  view.setInt32(84, msg.latInt, true);
  view.setInt32(88, msg.lonInt, true);

  return buffer;
}

export function deserializeSimState(payload: Uint8Array): SimState {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    q1: view.getFloat32(0, true),
    q2: view.getFloat32(4, true),
    q3: view.getFloat32(8, true),
    q4: view.getFloat32(12, true),
    roll: view.getFloat32(16, true),
    pitch: view.getFloat32(20, true),
    yaw: view.getFloat32(24, true),
    xacc: view.getFloat32(28, true),
    yacc: view.getFloat32(32, true),
    zacc: view.getFloat32(36, true),
    xgyro: view.getFloat32(40, true),
    ygyro: view.getFloat32(44, true),
    zgyro: view.getFloat32(48, true),
    lat: view.getFloat32(52, true),
    lon: view.getFloat32(56, true),
    alt: view.getFloat32(60, true),
    stdDevHorz: view.getFloat32(64, true),
    stdDevVert: view.getFloat32(68, true),
    vn: view.getFloat32(72, true),
    ve: view.getFloat32(76, true),
    vd: view.getFloat32(80, true),
    latInt: view.getInt32(84, true),
    lonInt: view.getInt32(88, true),
  };
}