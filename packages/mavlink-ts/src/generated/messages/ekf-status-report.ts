/**
 * EKF Status message including flags and variances.
 * Message ID: 193
 * CRC Extra: 203
 */
export interface EkfStatusReport {
  /** Flags. */
  flags: number;
  /** Velocity variance. */
  velocityVariance: number;
  /** Horizontal Position variance. */
  posHorizVariance: number;
  /** Vertical Position variance. */
  posVertVariance: number;
  /** Compass variance. */
  compassVariance: number;
  /** Terrain Altitude variance. */
  terrainAltVariance: number;
  /** Airspeed variance. */
  airspeedVariance: number;
}

export const EKF_STATUS_REPORT_ID = 193;
export const EKF_STATUS_REPORT_CRC_EXTRA = 203;
export const EKF_STATUS_REPORT_MIN_LENGTH = 26;
export const EKF_STATUS_REPORT_MAX_LENGTH = 26;

export function serializeEkfStatusReport(msg: EkfStatusReport): Uint8Array {
  const buffer = new Uint8Array(26);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.velocityVariance, true);
  view.setFloat32(4, msg.posHorizVariance, true);
  view.setFloat32(8, msg.posVertVariance, true);
  view.setFloat32(12, msg.compassVariance, true);
  view.setFloat32(16, msg.terrainAltVariance, true);
  view.setFloat32(20, msg.airspeedVariance, true);
  view.setUint16(24, msg.flags, true);

  return buffer;
}

export function deserializeEkfStatusReport(payload: Uint8Array): EkfStatusReport {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    velocityVariance: view.getFloat32(0, true),
    posHorizVariance: view.getFloat32(4, true),
    posVertVariance: view.getFloat32(8, true),
    compassVariance: view.getFloat32(12, true),
    terrainAltVariance: view.getFloat32(16, true),
    airspeedVariance: view.getFloat32(20, true),
    flags: view.getUint16(24, true),
  };
}