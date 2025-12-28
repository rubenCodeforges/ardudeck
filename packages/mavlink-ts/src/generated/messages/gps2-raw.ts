/**
 * Second GPS data.
 * Message ID: 124
 * CRC Extra: 57
 */
export interface Gps2Raw {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** GPS fix type. */
  fixType: number;
  /** Latitude (WGS84) (degE7) */
  lat: number;
  /** Longitude (WGS84) (degE7) */
  lon: number;
  /** Altitude (MSL). Positive for up. (mm) */
  alt: number;
  /** GPS HDOP horizontal dilution of position (unitless). If unknown, set to: UINT16_MAX */
  eph: number;
  /** GPS VDOP vertical dilution of position (unitless). If unknown, set to: UINT16_MAX */
  epv: number;
  /** GPS ground speed. If unknown, set to: UINT16_MAX (cm/s) */
  vel: number;
  /** Course over ground (NOT heading, but direction of movement): 0.0..359.99 degrees. If unknown, set to: UINT16_MAX (cdeg) */
  cog: number;
  /** Number of satellites visible. If unknown, set to 255 */
  satellitesVisible: number;
  /** Number of DGPS satellites */
  dgpsNumch: number;
  /** Age of DGPS info (ms) */
  dgpsAge: number;
  /** Yaw in earth frame from north. Use 0 if this GPS does not provide yaw. Use UINT16_MAX if this GPS is configured to provide yaw and is currently unable to provide it. Use 36000 for north. (cdeg) */
  yaw: number;
  /** Altitude (above WGS84, EGM96 ellipsoid). Positive for up. (mm) */
  altEllipsoid: number;
  /** Position uncertainty. (mm) */
  hAcc: number;
  /** Altitude uncertainty. (mm) */
  vAcc: number;
  /** Speed uncertainty. (mm/s) */
  velAcc: number;
  /** Heading / track uncertainty (degE5) */
  hdgAcc: number;
}

export const GPS2_RAW_ID = 124;
export const GPS2_RAW_CRC_EXTRA = 57;
export const GPS2_RAW_MIN_LENGTH = 57;
export const GPS2_RAW_MAX_LENGTH = 57;

export function serializeGps2Raw(msg: Gps2Raw): Uint8Array {
  const buffer = new Uint8Array(57);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt32(8, msg.lat, true);
  view.setInt32(12, msg.lon, true);
  view.setInt32(16, msg.alt, true);
  view.setUint32(20, msg.dgpsAge, true);
  view.setInt32(24, msg.altEllipsoid, true);
  view.setUint32(28, msg.hAcc, true);
  view.setUint32(32, msg.vAcc, true);
  view.setUint32(36, msg.velAcc, true);
  view.setUint32(40, msg.hdgAcc, true);
  view.setUint16(44, msg.eph, true);
  view.setUint16(46, msg.epv, true);
  view.setUint16(48, msg.vel, true);
  view.setUint16(50, msg.cog, true);
  view.setUint16(52, msg.yaw, true);
  buffer[54] = msg.fixType & 0xff;
  buffer[55] = msg.satellitesVisible & 0xff;
  buffer[56] = msg.dgpsNumch & 0xff;

  return buffer;
}

export function deserializeGps2Raw(payload: Uint8Array): Gps2Raw {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    lat: view.getInt32(8, true),
    lon: view.getInt32(12, true),
    alt: view.getInt32(16, true),
    dgpsAge: view.getUint32(20, true),
    altEllipsoid: view.getInt32(24, true),
    hAcc: view.getUint32(28, true),
    vAcc: view.getUint32(32, true),
    velAcc: view.getUint32(36, true),
    hdgAcc: view.getUint32(40, true),
    eph: view.getUint16(44, true),
    epv: view.getUint16(46, true),
    vel: view.getUint16(48, true),
    cog: view.getUint16(50, true),
    yaw: view.getUint16(52, true),
    fixType: payload[54],
    satellitesVisible: payload[55],
    dgpsNumch: payload[56],
  };
}