/**
 * Wind covariance estimate from vehicle.
 * Message ID: 231
 * CRC Extra: 105
 */
export interface WindCov {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Wind in X (NED) direction (m/s) */
  windX: number;
  /** Wind in Y (NED) direction (m/s) */
  windY: number;
  /** Wind in Z (NED) direction (m/s) */
  windZ: number;
  /** Variability of the wind in XY. RMS of a 1 Hz lowpassed wind estimate. (m/s) */
  varHoriz: number;
  /** Variability of the wind in Z. RMS of a 1 Hz lowpassed wind estimate. (m/s) */
  varVert: number;
  /** Altitude (MSL) that this measurement was taken at (m) */
  windAlt: number;
  /** Horizontal speed 1-STD accuracy (m) */
  horizAccuracy: number;
  /** Vertical speed 1-STD accuracy (m) */
  vertAccuracy: number;
}

export const WIND_COV_ID = 231;
export const WIND_COV_CRC_EXTRA = 105;
export const WIND_COV_MIN_LENGTH = 40;
export const WIND_COV_MAX_LENGTH = 40;

export function serializeWindCov(msg: WindCov): Uint8Array {
  const buffer = new Uint8Array(40);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.windX, true);
  view.setFloat32(12, msg.windY, true);
  view.setFloat32(16, msg.windZ, true);
  view.setFloat32(20, msg.varHoriz, true);
  view.setFloat32(24, msg.varVert, true);
  view.setFloat32(28, msg.windAlt, true);
  view.setFloat32(32, msg.horizAccuracy, true);
  view.setFloat32(36, msg.vertAccuracy, true);

  return buffer;
}

export function deserializeWindCov(payload: Uint8Array): WindCov {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    windX: view.getFloat32(8, true),
    windY: view.getFloat32(12, true),
    windZ: view.getFloat32(16, true),
    varHoriz: view.getFloat32(20, true),
    varVert: view.getFloat32(24, true),
    windAlt: view.getFloat32(28, true),
    horizAccuracy: view.getFloat32(32, true),
    vertAccuracy: view.getFloat32(36, true),
  };
}