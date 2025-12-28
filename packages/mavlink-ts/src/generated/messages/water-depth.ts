/**
 * Water depth
 * Message ID: 11038
 * CRC Extra: 47
 */
export interface WaterDepth {
  /** Timestamp (time since system boot) (ms) */
  timeBootMs: number;
  /** Onboard ID of the sensor */
  id: number;
  /** Sensor data healthy (0=unhealthy, 1=healthy) */
  healthy: number;
  /** Latitude (degE7) */
  lat: number;
  /** Longitude (degE7) */
  lng: number;
  /** Altitude (MSL) of vehicle (m) */
  alt: number;
  /** Roll angle (rad) */
  roll: number;
  /** Pitch angle (rad) */
  pitch: number;
  /** Yaw angle (rad) */
  yaw: number;
  /** Distance (uncorrected) (m) */
  distance: number;
  /** Water temperature (degC) */
  temperature: number;
}

export const WATER_DEPTH_ID = 11038;
export const WATER_DEPTH_CRC_EXTRA = 47;
export const WATER_DEPTH_MIN_LENGTH = 38;
export const WATER_DEPTH_MAX_LENGTH = 38;

export function serializeWaterDepth(msg: WaterDepth): Uint8Array {
  const buffer = new Uint8Array(38);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setInt32(4, msg.lat, true);
  view.setInt32(8, msg.lng, true);
  view.setFloat32(12, msg.alt, true);
  view.setFloat32(16, msg.roll, true);
  view.setFloat32(20, msg.pitch, true);
  view.setFloat32(24, msg.yaw, true);
  view.setFloat32(28, msg.distance, true);
  view.setFloat32(32, msg.temperature, true);
  buffer[36] = msg.id & 0xff;
  buffer[37] = msg.healthy & 0xff;

  return buffer;
}

export function deserializeWaterDepth(payload: Uint8Array): WaterDepth {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    lat: view.getInt32(4, true),
    lng: view.getInt32(8, true),
    alt: view.getFloat32(12, true),
    roll: view.getFloat32(16, true),
    pitch: view.getFloat32(20, true),
    yaw: view.getFloat32(24, true),
    distance: view.getFloat32(28, true),
    temperature: view.getFloat32(32, true),
    id: payload[36],
    healthy: payload[37],
  };
}