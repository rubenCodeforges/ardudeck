/**
 * The global position resulting from GPS and sensor fusion.
 * Message ID: 340
 * CRC Extra: 99
 */
export interface UtmGlobalPosition {
  /** Time of applicability of position (microseconds since UNIX epoch). (us) */
  time: bigint;
  /** Unique UAS ID. */
  uasId: number[];
  /** Latitude (WGS84) (degE7) */
  lat: number;
  /** Longitude (WGS84) (degE7) */
  lon: number;
  /** Altitude (WGS84) (mm) */
  alt: number;
  /** Altitude above ground (mm) */
  relativeAlt: number;
  /** Ground X speed (latitude, positive north) (cm/s) */
  vx: number;
  /** Ground Y speed (longitude, positive east) (cm/s) */
  vy: number;
  /** Ground Z speed (altitude, positive down) (cm/s) */
  vz: number;
  /** Horizontal position uncertainty (standard deviation) (mm) */
  hAcc: number;
  /** Altitude uncertainty (standard deviation) (mm) */
  vAcc: number;
  /** Speed uncertainty (standard deviation) (cm/s) */
  velAcc: number;
  /** Next waypoint, latitude (WGS84) (degE7) */
  nextLat: number;
  /** Next waypoint, longitude (WGS84) (degE7) */
  nextLon: number;
  /** Next waypoint, altitude (WGS84) (mm) */
  nextAlt: number;
  /** Time until next update. Set to 0 if unknown or in data driven mode. (cs) */
  updateRate: number;
  /** Flight state */
  flightState: number;
  /** Bitwise OR combination of the data available flags. */
  flags: number;
}

export const UTM_GLOBAL_POSITION_ID = 340;
export const UTM_GLOBAL_POSITION_CRC_EXTRA = 99;
export const UTM_GLOBAL_POSITION_MIN_LENGTH = 70;
export const UTM_GLOBAL_POSITION_MAX_LENGTH = 70;

export function serializeUtmGlobalPosition(msg: UtmGlobalPosition): Uint8Array {
  const buffer = new Uint8Array(70);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.time), true);
  view.setInt32(8, msg.lat, true);
  view.setInt32(12, msg.lon, true);
  view.setInt32(16, msg.alt, true);
  view.setInt32(20, msg.relativeAlt, true);
  view.setInt32(24, msg.nextLat, true);
  view.setInt32(28, msg.nextLon, true);
  view.setInt32(32, msg.nextAlt, true);
  view.setInt16(36, msg.vx, true);
  view.setInt16(38, msg.vy, true);
  view.setInt16(40, msg.vz, true);
  view.setUint16(42, msg.hAcc, true);
  view.setUint16(44, msg.vAcc, true);
  view.setUint16(46, msg.velAcc, true);
  view.setUint16(48, msg.updateRate, true);
  // Array: uas_id
  for (let i = 0; i < 18; i++) {
    buffer[50 + i * 1] = msg.uasId[i] ?? 0 & 0xff;
  }
  buffer[68] = msg.flightState & 0xff;
  buffer[69] = msg.flags & 0xff;

  return buffer;
}

export function deserializeUtmGlobalPosition(payload: Uint8Array): UtmGlobalPosition {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    time: view.getBigUint64(0, true),
    lat: view.getInt32(8, true),
    lon: view.getInt32(12, true),
    alt: view.getInt32(16, true),
    relativeAlt: view.getInt32(20, true),
    nextLat: view.getInt32(24, true),
    nextLon: view.getInt32(28, true),
    nextAlt: view.getInt32(32, true),
    vx: view.getInt16(36, true),
    vy: view.getInt16(38, true),
    vz: view.getInt16(40, true),
    hAcc: view.getUint16(42, true),
    vAcc: view.getUint16(44, true),
    velAcc: view.getUint16(46, true),
    updateRate: view.getUint16(48, true),
    uasId: Array.from({ length: 18 }, (_, i) => payload[50 + i * 1]),
    flightState: payload[68],
    flags: payload[69],
  };
}