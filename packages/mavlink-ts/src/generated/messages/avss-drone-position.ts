/**
 * Drone position.
 * Message ID: 60051
 * CRC Extra: 245
 */
export interface AvssDronePosition {
  /** Timestamp (time since FC boot). (ms) */
  timeBootMs: number;
  /** Latitude, expressed (degE7) */
  lat: number;
  /** Longitude, expressed (degE7) */
  lon: number;
  /** Altitude (MSL). Note that virtually all GPS modules provide both WGS84 and MSL. (mm) */
  alt: number;
  /** Altitude above ground, This altitude is measured by a ultrasound, Laser rangefinder or millimeter-wave radar (m) */
  groundAlt: number;
  /** This altitude is measured by a barometer (m) */
  barometerAlt: number;
}

export const AVSS_DRONE_POSITION_ID = 60051;
export const AVSS_DRONE_POSITION_CRC_EXTRA = 245;
export const AVSS_DRONE_POSITION_MIN_LENGTH = 24;
export const AVSS_DRONE_POSITION_MAX_LENGTH = 24;

export function serializeAvssDronePosition(msg: AvssDronePosition): Uint8Array {
  const buffer = new Uint8Array(24);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setInt32(4, msg.lat, true);
  view.setInt32(8, msg.lon, true);
  view.setInt32(12, msg.alt, true);
  view.setFloat32(16, msg.groundAlt, true);
  view.setFloat32(20, msg.barometerAlt, true);

  return buffer;
}

export function deserializeAvssDronePosition(payload: Uint8Array): AvssDronePosition {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    lat: view.getInt32(4, true),
    lon: view.getInt32(8, true),
    alt: view.getInt32(12, true),
    groundAlt: view.getFloat32(16, true),
    barometerAlt: view.getFloat32(20, true),
  };
}