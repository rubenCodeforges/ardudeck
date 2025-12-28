/**
 * GPS sensor input message.  This is a raw sensor value sent by the GPS. This is NOT the global position estimate of the system.
 * Message ID: 232
 * CRC Extra: 187
 */
export interface GpsInput {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** ID of the GPS for multiple GPS inputs */
  gpsId: number;
  /** Bitmap indicating which GPS input flags fields to ignore.  All other fields must be provided. */
  ignoreFlags: number;
  /** GPS time (from start of GPS week) (ms) */
  timeWeekMs: number;
  /** GPS week number */
  timeWeek: number;
  /** 0-1: no fix, 2: 2D fix, 3: 3D fix. 4: 3D with DGPS. 5: 3D with RTK */
  fixType: number;
  /** Latitude (WGS84) (degE7) */
  lat: number;
  /** Longitude (WGS84) (degE7) */
  lon: number;
  /** Altitude (MSL). Positive for up. (m) */
  alt: number;
  /** GPS HDOP horizontal dilution of position (unitless). If unknown, set to: UINT16_MAX */
  hdop: number;
  /** GPS VDOP vertical dilution of position (unitless). If unknown, set to: UINT16_MAX */
  vdop: number;
  /** GPS velocity in north direction in earth-fixed NED frame (m/s) */
  vn: number;
  /** GPS velocity in east direction in earth-fixed NED frame (m/s) */
  ve: number;
  /** GPS velocity in down direction in earth-fixed NED frame (m/s) */
  vd: number;
  /** GPS speed accuracy (m/s) */
  speedAccuracy: number;
  /** GPS horizontal accuracy (m) */
  horizAccuracy: number;
  /** GPS vertical accuracy (m) */
  vertAccuracy: number;
  /** Number of satellites visible. */
  satellitesVisible: number;
  /** Yaw of vehicle relative to Earth's North, zero means not available, use 36000 for north (cdeg) */
  yaw: number;
}

export const GPS_INPUT_ID = 232;
export const GPS_INPUT_CRC_EXTRA = 187;
export const GPS_INPUT_MIN_LENGTH = 65;
export const GPS_INPUT_MAX_LENGTH = 65;

export function serializeGpsInput(msg: GpsInput): Uint8Array {
  const buffer = new Uint8Array(65);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setUint32(8, msg.timeWeekMs, true);
  view.setInt32(12, msg.lat, true);
  view.setInt32(16, msg.lon, true);
  view.setFloat32(20, msg.alt, true);
  view.setFloat32(24, msg.hdop, true);
  view.setFloat32(28, msg.vdop, true);
  view.setFloat32(32, msg.vn, true);
  view.setFloat32(36, msg.ve, true);
  view.setFloat32(40, msg.vd, true);
  view.setFloat32(44, msg.speedAccuracy, true);
  view.setFloat32(48, msg.horizAccuracy, true);
  view.setFloat32(52, msg.vertAccuracy, true);
  view.setUint16(56, msg.ignoreFlags, true);
  view.setUint16(58, msg.timeWeek, true);
  view.setUint16(60, msg.yaw, true);
  buffer[62] = msg.gpsId & 0xff;
  buffer[63] = msg.fixType & 0xff;
  buffer[64] = msg.satellitesVisible & 0xff;

  return buffer;
}

export function deserializeGpsInput(payload: Uint8Array): GpsInput {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    timeWeekMs: view.getUint32(8, true),
    lat: view.getInt32(12, true),
    lon: view.getInt32(16, true),
    alt: view.getFloat32(20, true),
    hdop: view.getFloat32(24, true),
    vdop: view.getFloat32(28, true),
    vn: view.getFloat32(32, true),
    ve: view.getFloat32(36, true),
    vd: view.getFloat32(40, true),
    speedAccuracy: view.getFloat32(44, true),
    horizAccuracy: view.getFloat32(48, true),
    vertAccuracy: view.getFloat32(52, true),
    ignoreFlags: view.getUint16(56, true),
    timeWeek: view.getUint16(58, true),
    yaw: view.getUint16(60, true),
    gpsId: payload[62],
    fixType: payload[63],
    satellitesVisible: payload[64],
  };
}