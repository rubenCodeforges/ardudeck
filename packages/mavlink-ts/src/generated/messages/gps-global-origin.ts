/**
 * Publishes the GPS coordinates of the vehicle local origin (0,0,0) position. Emitted whenever a new GPS-Local position mapping is requested or set - e.g. following SET_GPS_GLOBAL_ORIGIN message.
 * Message ID: 49
 * CRC Extra: 95
 */
export interface GpsGlobalOrigin {
  /** Latitude (WGS84) (degE7) */
  latitude: number;
  /** Longitude (WGS84) (degE7) */
  longitude: number;
  /** Altitude (MSL). Positive for up. (mm) */
  altitude: number;
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
}

export const GPS_GLOBAL_ORIGIN_ID = 49;
export const GPS_GLOBAL_ORIGIN_CRC_EXTRA = 95;
export const GPS_GLOBAL_ORIGIN_MIN_LENGTH = 20;
export const GPS_GLOBAL_ORIGIN_MAX_LENGTH = 20;

export function serializeGpsGlobalOrigin(msg: GpsGlobalOrigin): Uint8Array {
  const buffer = new Uint8Array(20);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt32(8, msg.latitude, true);
  view.setInt32(12, msg.longitude, true);
  view.setInt32(16, msg.altitude, true);

  return buffer;
}

export function deserializeGpsGlobalOrigin(payload: Uint8Array): GpsGlobalOrigin {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    latitude: view.getInt32(8, true),
    longitude: view.getInt32(12, true),
    altitude: view.getInt32(16, true),
  };
}