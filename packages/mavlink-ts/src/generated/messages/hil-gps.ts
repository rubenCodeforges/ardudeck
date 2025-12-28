/**
 * The global position, as returned by the Global Positioning System (GPS). This is
                 NOT the global position estimate of the system, but rather a RAW sensor value. See message GLOBAL_POSITION_INT for the global position estimate.
 * Message ID: 113
 * CRC Extra: 204
 */
export interface HilGps {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** 0-1: no fix, 2: 2D fix, 3: 3D fix. Some applications will not use the value of this field unless it is at least two, so always correctly fill in the fix. */
  fixType: number;
  /** Latitude (WGS84) (degE7) */
  lat: number;
  /** Longitude (WGS84) (degE7) */
  lon: number;
  /** Altitude (MSL). Positive for up. (mm) */
  alt: number;
  /** GPS HDOP horizontal dilution of position (unitless * 100). If unknown, set to: UINT16_MAX */
  eph: number;
  /** GPS VDOP vertical dilution of position (unitless * 100). If unknown, set to: UINT16_MAX */
  epv: number;
  /** GPS ground speed. If unknown, set to: UINT16_MAX (cm/s) */
  vel: number;
  /** GPS velocity in north direction in earth-fixed NED frame (cm/s) */
  vn: number;
  /** GPS velocity in east direction in earth-fixed NED frame (cm/s) */
  ve: number;
  /** GPS velocity in down direction in earth-fixed NED frame (cm/s) */
  vd: number;
  /** Course over ground (NOT heading, but direction of movement), 0.0..359.99 degrees. If unknown, set to: UINT16_MAX (cdeg) */
  cog: number;
  /** Number of satellites visible. If unknown, set to UINT8_MAX */
  satellitesVisible: number;
  /** GPS ID (zero indexed). Used for multiple GPS inputs */
  id: number;
  /** Yaw of vehicle relative to Earth's North, zero means not available, use 36000 for north (cdeg) */
  yaw: number;
}

export const HIL_GPS_ID = 113;
export const HIL_GPS_CRC_EXTRA = 204;
export const HIL_GPS_MIN_LENGTH = 39;
export const HIL_GPS_MAX_LENGTH = 39;

export function serializeHilGps(msg: HilGps): Uint8Array {
  const buffer = new Uint8Array(39);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt32(8, msg.lat, true);
  view.setInt32(12, msg.lon, true);
  view.setInt32(16, msg.alt, true);
  view.setUint16(20, msg.eph, true);
  view.setUint16(22, msg.epv, true);
  view.setUint16(24, msg.vel, true);
  view.setInt16(26, msg.vn, true);
  view.setInt16(28, msg.ve, true);
  view.setInt16(30, msg.vd, true);
  view.setUint16(32, msg.cog, true);
  view.setUint16(34, msg.yaw, true);
  buffer[36] = msg.fixType & 0xff;
  buffer[37] = msg.satellitesVisible & 0xff;
  buffer[38] = msg.id & 0xff;

  return buffer;
}

export function deserializeHilGps(payload: Uint8Array): HilGps {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    lat: view.getInt32(8, true),
    lon: view.getInt32(12, true),
    alt: view.getInt32(16, true),
    eph: view.getUint16(20, true),
    epv: view.getUint16(22, true),
    vel: view.getUint16(24, true),
    vn: view.getInt16(26, true),
    ve: view.getInt16(28, true),
    vd: view.getInt16(30, true),
    cog: view.getUint16(32, true),
    yaw: view.getUint16(34, true),
    fixType: payload[36],
    satellitesVisible: payload[37],
    id: payload[38],
  };
}