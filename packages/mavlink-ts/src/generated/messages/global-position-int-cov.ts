/**
 * The filtered global position (e.g. fused GPS and accelerometers). The position is in GPS-frame (right-handed, Z-up). It  is designed as scaled integer message since the resolution of float is not sufficient. NOTE: This message is intended for onboard networks / companion computers and higher-bandwidth links and optimized for accuracy and completeness. Please use the GLOBAL_POSITION_INT message for a minimal subset.
 * Message ID: 63
 * CRC Extra: 119
 */
export interface GlobalPositionIntCov {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Class id of the estimator this estimate originated from. */
  estimatorType: number;
  /** Latitude (degE7) */
  lat: number;
  /** Longitude (degE7) */
  lon: number;
  /** Altitude in meters above MSL (mm) */
  alt: number;
  /** Altitude above ground (mm) */
  relativeAlt: number;
  /** Ground X Speed (Latitude) (m/s) */
  vx: number;
  /** Ground Y Speed (Longitude) (m/s) */
  vy: number;
  /** Ground Z Speed (Altitude) (m/s) */
  vz: number;
  /** Row-major representation of a 6x6 position and velocity 6x6 cross-covariance matrix (states: lat, lon, alt, vx, vy, vz; first six entries are the first ROW, next six entries are the second row, etc.). If unknown, assign NaN value to first element in the array. */
  covariance: number[];
}

export const GLOBAL_POSITION_INT_COV_ID = 63;
export const GLOBAL_POSITION_INT_COV_CRC_EXTRA = 119;
export const GLOBAL_POSITION_INT_COV_MIN_LENGTH = 181;
export const GLOBAL_POSITION_INT_COV_MAX_LENGTH = 181;

export function serializeGlobalPositionIntCov(msg: GlobalPositionIntCov): Uint8Array {
  const buffer = new Uint8Array(181);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt32(8, msg.lat, true);
  view.setInt32(12, msg.lon, true);
  view.setInt32(16, msg.alt, true);
  view.setInt32(20, msg.relativeAlt, true);
  view.setFloat32(24, msg.vx, true);
  view.setFloat32(28, msg.vy, true);
  view.setFloat32(32, msg.vz, true);
  // Array: covariance
  for (let i = 0; i < 36; i++) {
    view.setFloat32(36 + i * 4, msg.covariance[i] ?? 0, true);
  }
  buffer[180] = msg.estimatorType & 0xff;

  return buffer;
}

export function deserializeGlobalPositionIntCov(payload: Uint8Array): GlobalPositionIntCov {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    lat: view.getInt32(8, true),
    lon: view.getInt32(12, true),
    alt: view.getInt32(16, true),
    relativeAlt: view.getInt32(20, true),
    vx: view.getFloat32(24, true),
    vy: view.getFloat32(28, true),
    vz: view.getFloat32(32, true),
    covariance: Array.from({ length: 36 }, (_, i) => view.getFloat32(36 + i * 4, true)),
    estimatorType: payload[180],
  };
}