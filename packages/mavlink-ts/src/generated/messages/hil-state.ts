/**
 * Sent from simulation to autopilot. This packet is useful for high throughput applications such as hardware in the loop simulations.
 * Message ID: 90
 * CRC Extra: 183
 */
export interface HilState {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Roll angle (rad) */
  roll: number;
  /** Pitch angle (rad) */
  pitch: number;
  /** Yaw angle (rad) */
  yaw: number;
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
  /** X acceleration (mG) */
  xacc: number;
  /** Y acceleration (mG) */
  yacc: number;
  /** Z acceleration (mG) */
  zacc: number;
}

export const HIL_STATE_ID = 90;
export const HIL_STATE_CRC_EXTRA = 183;
export const HIL_STATE_MIN_LENGTH = 56;
export const HIL_STATE_MAX_LENGTH = 56;

export function serializeHilState(msg: HilState): Uint8Array {
  const buffer = new Uint8Array(56);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.roll, true);
  view.setFloat32(12, msg.pitch, true);
  view.setFloat32(16, msg.yaw, true);
  view.setFloat32(20, msg.rollspeed, true);
  view.setFloat32(24, msg.pitchspeed, true);
  view.setFloat32(28, msg.yawspeed, true);
  view.setInt32(32, msg.lat, true);
  view.setInt32(36, msg.lon, true);
  view.setInt32(40, msg.alt, true);
  view.setInt16(44, msg.vx, true);
  view.setInt16(46, msg.vy, true);
  view.setInt16(48, msg.vz, true);
  view.setInt16(50, msg.xacc, true);
  view.setInt16(52, msg.yacc, true);
  view.setInt16(54, msg.zacc, true);

  return buffer;
}

export function deserializeHilState(payload: Uint8Array): HilState {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    roll: view.getFloat32(8, true),
    pitch: view.getFloat32(12, true),
    yaw: view.getFloat32(16, true),
    rollspeed: view.getFloat32(20, true),
    pitchspeed: view.getFloat32(24, true),
    yawspeed: view.getFloat32(28, true),
    lat: view.getInt32(32, true),
    lon: view.getInt32(36, true),
    alt: view.getInt32(40, true),
    vx: view.getInt16(44, true),
    vy: view.getInt16(46, true),
    vz: view.getInt16(48, true),
    xacc: view.getInt16(50, true),
    yacc: view.getInt16(52, true),
    zacc: view.getInt16(54, true),
  };
}