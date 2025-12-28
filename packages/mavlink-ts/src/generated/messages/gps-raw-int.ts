/**
 * The global position, as returned by the Global Positioning System (GPS). This is
                NOT the global position estimate of the system, but rather a RAW sensor value. See message GLOBAL_POSITION_INT for the global position estimate.
 * Message ID: 24
 * CRC Extra: 103
 */
export interface GpsRawInt {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** GPS fix type. */
  fixType: number;
  /** Latitude (WGS84, EGM96 ellipsoid) (degE7) */
  lat: number;
  /** Longitude (WGS84, EGM96 ellipsoid) (degE7) */
  lon: number;
  /** Altitude (MSL). Positive for up. Note that virtually all GPS modules provide the MSL altitude in addition to the WGS84 altitude. (mm) */
  alt: number;
  /** GPS HDOP horizontal dilution of position (unitless * 100). If unknown, set to: UINT16_MAX */
  eph: number;
  /** GPS VDOP vertical dilution of position (unitless * 100). If unknown, set to: UINT16_MAX */
  epv: number;
  /** GPS ground speed. If unknown, set to: UINT16_MAX (cm/s) */
  vel: number;
  /** Course over ground (NOT heading, but direction of movement) in degrees * 100, 0.0..359.99 degrees. If unknown, set to: UINT16_MAX (cdeg) */
  cog: number;
  /** Number of satellites visible. If unknown, set to UINT8_MAX */
  satellitesVisible: number;
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
  /** Yaw in earth frame from north. Use 0 if this GPS does not provide yaw. Use UINT16_MAX if this GPS is configured to provide yaw and is currently unable to provide it. Use 36000 for north. (cdeg) */
  yaw: number;
}

export const GPS_RAW_INT_ID = 24;
export const GPS_RAW_INT_CRC_EXTRA = 103;
export const GPS_RAW_INT_MIN_LENGTH = 52;
export const GPS_RAW_INT_MAX_LENGTH = 52;

export function serializeGpsRawInt(msg: GpsRawInt): Uint8Array {
  const buffer = new Uint8Array(52);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt32(8, msg.lat, true);
  view.setInt32(12, msg.lon, true);
  view.setInt32(16, msg.alt, true);
  view.setInt32(20, msg.altEllipsoid, true);
  view.setUint32(24, msg.hAcc, true);
  view.setUint32(28, msg.vAcc, true);
  view.setUint32(32, msg.velAcc, true);
  view.setUint32(36, msg.hdgAcc, true);
  view.setUint16(40, msg.eph, true);
  view.setUint16(42, msg.epv, true);
  view.setUint16(44, msg.vel, true);
  view.setUint16(46, msg.cog, true);
  view.setUint16(48, msg.yaw, true);
  buffer[50] = msg.fixType & 0xff;
  buffer[51] = msg.satellitesVisible & 0xff;

  return buffer;
}

export function deserializeGpsRawInt(payload: Uint8Array): GpsRawInt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    lat: view.getInt32(8, true),
    lon: view.getInt32(12, true),
    alt: view.getInt32(16, true),
    altEllipsoid: view.getInt32(20, true),
    hAcc: view.getUint32(24, true),
    vAcc: view.getUint32(28, true),
    velAcc: view.getUint32(32, true),
    hdgAcc: view.getUint32(36, true),
    eph: view.getUint16(40, true),
    epv: view.getUint16(42, true),
    vel: view.getUint16(44, true),
    cog: view.getUint16(46, true),
    yaw: view.getUint16(48, true),
    fixType: payload[50],
    satellitesVisible: payload[51],
  };
}