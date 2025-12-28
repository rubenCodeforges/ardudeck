/**
 * Extended EKF state estimates for ASLUAVs
 * Message ID: 8007
 * CRC Extra: 64
 */
export interface EkfExt {
  /** Time since system start (us) */
  timestamp: bigint;
  /** Magnitude of wind velocity (in lateral inertial plane) (m/s) */
  windspeed: number;
  /** Wind heading angle from North (rad) */
  winddir: number;
  /** Z (Down) component of inertial wind velocity (m/s) */
  windz: number;
  /** Magnitude of air velocity (m/s) */
  airspeed: number;
  /** Sideslip angle (rad) */
  beta: number;
  /** Angle of attack (rad) */
  alpha: number;
}

export const EKF_EXT_ID = 8007;
export const EKF_EXT_CRC_EXTRA = 64;
export const EKF_EXT_MIN_LENGTH = 32;
export const EKF_EXT_MAX_LENGTH = 32;

export function serializeEkfExt(msg: EkfExt): Uint8Array {
  const buffer = new Uint8Array(32);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setFloat32(8, msg.windspeed, true);
  view.setFloat32(12, msg.winddir, true);
  view.setFloat32(16, msg.windz, true);
  view.setFloat32(20, msg.airspeed, true);
  view.setFloat32(24, msg.beta, true);
  view.setFloat32(28, msg.alpha, true);

  return buffer;
}

export function deserializeEkfExt(payload: Uint8Array): EkfExt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    windspeed: view.getFloat32(8, true),
    winddir: view.getFloat32(12, true),
    windz: view.getFloat32(16, true),
    airspeed: view.getFloat32(20, true),
    beta: view.getFloat32(24, true),
    alpha: view.getFloat32(28, true),
  };
}