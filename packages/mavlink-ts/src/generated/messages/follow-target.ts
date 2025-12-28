/**
 * Current motion information from a designated system
 * Message ID: 144
 * CRC Extra: 127
 */
export interface FollowTarget {
  /** Timestamp (time since system boot). (ms) */
  timestamp: bigint;
  /** bit positions for tracker reporting capabilities (POS = 0, VEL = 1, ACCEL = 2, ATT + RATES = 3) */
  estCapabilities: number;
  /** Latitude (WGS84) (degE7) */
  lat: number;
  /** Longitude (WGS84) (degE7) */
  lon: number;
  /** Altitude (MSL) (m) */
  alt: number;
  /** target velocity (0,0,0) for unknown (m/s) */
  vel: number[];
  /** linear target acceleration (0,0,0) for unknown (m/s/s) */
  acc: number[];
  /** (1 0 0 0 for unknown) */
  attitudeQ: number[];
  /** (0 0 0 for unknown) */
  rates: number[];
  /** eph epv */
  positionCov: number[];
  /** button states or switches of a tracker device */
  customState: bigint;
}

export const FOLLOW_TARGET_ID = 144;
export const FOLLOW_TARGET_CRC_EXTRA = 127;
export const FOLLOW_TARGET_MIN_LENGTH = 93;
export const FOLLOW_TARGET_MAX_LENGTH = 93;

export function serializeFollowTarget(msg: FollowTarget): Uint8Array {
  const buffer = new Uint8Array(93);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setBigUint64(8, BigInt(msg.customState), true);
  view.setInt32(16, msg.lat, true);
  view.setInt32(20, msg.lon, true);
  view.setFloat32(24, msg.alt, true);
  // Array: vel
  for (let i = 0; i < 3; i++) {
    view.setFloat32(28 + i * 4, msg.vel[i] ?? 0, true);
  }
  // Array: acc
  for (let i = 0; i < 3; i++) {
    view.setFloat32(40 + i * 4, msg.acc[i] ?? 0, true);
  }
  // Array: attitude_q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(52 + i * 4, msg.attitudeQ[i] ?? 0, true);
  }
  // Array: rates
  for (let i = 0; i < 3; i++) {
    view.setFloat32(68 + i * 4, msg.rates[i] ?? 0, true);
  }
  // Array: position_cov
  for (let i = 0; i < 3; i++) {
    view.setFloat32(80 + i * 4, msg.positionCov[i] ?? 0, true);
  }
  buffer[92] = msg.estCapabilities & 0xff;

  return buffer;
}

export function deserializeFollowTarget(payload: Uint8Array): FollowTarget {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    customState: view.getBigUint64(8, true),
    lat: view.getInt32(16, true),
    lon: view.getInt32(20, true),
    alt: view.getFloat32(24, true),
    vel: Array.from({ length: 3 }, (_, i) => view.getFloat32(28 + i * 4, true)),
    acc: Array.from({ length: 3 }, (_, i) => view.getFloat32(40 + i * 4, true)),
    attitudeQ: Array.from({ length: 4 }, (_, i) => view.getFloat32(52 + i * 4, true)),
    rates: Array.from({ length: 3 }, (_, i) => view.getFloat32(68 + i * 4, true)),
    positionCov: Array.from({ length: 3 }, (_, i) => view.getFloat32(80 + i * 4, true)),
    estCapabilities: payload[92],
  };
}