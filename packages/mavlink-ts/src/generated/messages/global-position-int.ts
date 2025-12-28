/**
 * The filtered global position (e.g. fused GPS and accelerometers). The position is in GPS-frame (right-handed, Z-up). It is designed as scaled integer message since the resolution of float is not sufficient.
 * Message ID: 33
 * CRC Extra: 104
 */
export interface GlobalPositionInt {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Latitude, expressed (degE7) */
  lat: number;
  /** Longitude, expressed (degE7) */
  lon: number;
  /** Altitude (MSL). Note that virtually all GPS modules provide both WGS84 and MSL. (mm) */
  alt: number;
  /** Altitude above home (mm) */
  relativeAlt: number;
  /** Ground X Speed (Latitude, positive north) (cm/s) */
  vx: number;
  /** Ground Y Speed (Longitude, positive east) (cm/s) */
  vy: number;
  /** Ground Z Speed (Altitude, positive down) (cm/s) */
  vz: number;
  /** Vehicle heading (yaw angle), 0.0..359.99 degrees. If unknown, set to: UINT16_MAX (cdeg) */
  hdg: number;
}

export const GLOBAL_POSITION_INT_ID = 33;
export const GLOBAL_POSITION_INT_CRC_EXTRA = 104;
export const GLOBAL_POSITION_INT_MIN_LENGTH = 28;
export const GLOBAL_POSITION_INT_MAX_LENGTH = 28;

export function serializeGlobalPositionInt(msg: GlobalPositionInt): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setInt32(4, msg.lat, true);
  view.setInt32(8, msg.lon, true);
  view.setInt32(12, msg.alt, true);
  view.setInt32(16, msg.relativeAlt, true);
  view.setInt16(20, msg.vx, true);
  view.setInt16(22, msg.vy, true);
  view.setInt16(24, msg.vz, true);
  view.setUint16(26, msg.hdg, true);

  return buffer;
}

export function deserializeGlobalPositionInt(payload: Uint8Array): GlobalPositionInt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    lat: view.getInt32(4, true),
    lon: view.getInt32(8, true),
    alt: view.getInt32(12, true),
    relativeAlt: view.getInt32(16, true),
    vx: view.getInt16(20, true),
    vy: view.getInt16(22, true),
    vz: view.getInt16(24, true),
    hdg: view.getUint16(26, true),
  };
}