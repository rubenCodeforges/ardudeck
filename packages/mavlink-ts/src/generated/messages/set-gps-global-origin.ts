/**
 * Sets the GPS coordinates of the vehicle local origin (0,0,0) position. Vehicle should emit GPS_GLOBAL_ORIGIN irrespective of whether the origin is changed. This enables transform between the local coordinate frame and the global (GPS) coordinate frame, which may be necessary when (for example) indoor and outdoor settings are connected and the MAV should move from in- to outdoor.
 * Message ID: 48
 * CRC Extra: 62
 */
export interface SetGpsGlobalOrigin {
  /** System ID */
  targetSystem: number;
  /** Latitude (WGS84) (degE7) */
  latitude: number;
  /** Longitude (WGS84) (degE7) */
  longitude: number;
  /** Altitude (MSL). Positive for up. (mm) */
  altitude: number;
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
}

export const SET_GPS_GLOBAL_ORIGIN_ID = 48;
export const SET_GPS_GLOBAL_ORIGIN_CRC_EXTRA = 62;
export const SET_GPS_GLOBAL_ORIGIN_MIN_LENGTH = 21;
export const SET_GPS_GLOBAL_ORIGIN_MAX_LENGTH = 21;

export function serializeSetGpsGlobalOrigin(msg: SetGpsGlobalOrigin): Uint8Array {
  const buffer = new Uint8Array(21);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt32(8, msg.latitude, true);
  view.setInt32(12, msg.longitude, true);
  view.setInt32(16, msg.altitude, true);
  buffer[20] = msg.targetSystem & 0xff;

  return buffer;
}

export function deserializeSetGpsGlobalOrigin(payload: Uint8Array): SetGpsGlobalOrigin {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    latitude: view.getInt32(8, true),
    longitude: view.getInt32(12, true),
    altitude: view.getInt32(16, true),
    targetSystem: payload[20],
  };
}