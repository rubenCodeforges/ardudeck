/**
 * Sent from simulation to autopilot, avoids in contrast to HIL_STATE singularities. This packet is useful for high throughput applications such as hardware in the loop simulations.
 * Message ID: 115
 * CRC Extra: 4
 */
export interface HilStateQuaternion {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Vehicle attitude expressed as normalized quaternion in w, x, y, z order (with 1 0 0 0 being the null-rotation) */
  attitudeQuaternion: number[];
  /** Body frame roll / phi angular speed (rad/s) */
  rollspeed: number;
  /** Body frame pitch / theta angular speed (rad/s) */
  pitchspeed: number;
  /** Body frame yaw / psi angular speed (rad/s) */
  yawspeed: number;
  /** Latitude (degE7) */
  lat: number;
  /** Longitude (degE7) */
  lon: number;
  /** Altitude (mm) */
  alt: number;
  /** Ground X Speed (Latitude) (cm/s) */
  vx: number;
  /** Ground Y Speed (Longitude) (cm/s) */
  vy: number;
  /** Ground Z Speed (Altitude) (cm/s) */
  vz: number;
  /** Indicated airspeed (cm/s) */
  indAirspeed: number;
  /** True airspeed (cm/s) */
  trueAirspeed: number;
  /** X acceleration (mG) */
  xacc: number;
  /** Y acceleration (mG) */
  yacc: number;
  /** Z acceleration (mG) */
  zacc: number;
}

export const HIL_STATE_QUATERNION_ID = 115;
export const HIL_STATE_QUATERNION_CRC_EXTRA = 4;
export const HIL_STATE_QUATERNION_MIN_LENGTH = 64;
export const HIL_STATE_QUATERNION_MAX_LENGTH = 64;

export function serializeHilStateQuaternion(msg: HilStateQuaternion): Uint8Array {
  const buffer = new Uint8Array(64);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  // Array: attitude_quaternion
  for (let i = 0; i < 4; i++) {
    view.setFloat32(8 + i * 4, msg.attitudeQuaternion[i] ?? 0, true);
  }
  view.setFloat32(24, msg.rollspeed, true);
  view.setFloat32(28, msg.pitchspeed, true);
  view.setFloat32(32, msg.yawspeed, true);
  view.setInt32(36, msg.lat, true);
  view.setInt32(40, msg.lon, true);
  view.setInt32(44, msg.alt, true);
  view.setInt16(48, msg.vx, true);
  view.setInt16(50, msg.vy, true);
  view.setInt16(52, msg.vz, true);
  view.setUint16(54, msg.indAirspeed, true);
  view.setUint16(56, msg.trueAirspeed, true);
  view.setInt16(58, msg.xacc, true);
  view.setInt16(60, msg.yacc, true);
  view.setInt16(62, msg.zacc, true);

  return buffer;
}

export function deserializeHilStateQuaternion(payload: Uint8Array): HilStateQuaternion {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    attitudeQuaternion: Array.from({ length: 4 }, (_, i) => view.getFloat32(8 + i * 4, true)),
    rollspeed: view.getFloat32(24, true),
    pitchspeed: view.getFloat32(28, true),
    yawspeed: view.getFloat32(32, true),
    lat: view.getInt32(36, true),
    lon: view.getInt32(40, true),
    alt: view.getInt32(44, true),
    vx: view.getInt16(48, true),
    vy: view.getInt16(50, true),
    vz: view.getInt16(52, true),
    indAirspeed: view.getUint16(54, true),
    trueAirspeed: view.getUint16(56, true),
    xacc: view.getInt16(58, true),
    yacc: view.getInt16(60, true),
    zacc: view.getInt16(62, true),
  };
}