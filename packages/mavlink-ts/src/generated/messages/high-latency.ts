/**
 * Message appropriate for high latency connections like Iridium
 * Message ID: 234
 * CRC Extra: 150
 */
export interface HighLatency {
  /** Bitmap of enabled system modes. */
  baseMode: number;
  /** A bitfield for use for autopilot-specific flags. */
  customMode: number;
  /** The landed state. Is set to MAV_LANDED_STATE_UNDEFINED if landed state is unknown. */
  landedState: number;
  /** roll (cdeg) */
  roll: number;
  /** pitch (cdeg) */
  pitch: number;
  /** heading (cdeg) */
  heading: number;
  /** throttle (percentage) (%) */
  throttle: number;
  /** heading setpoint (cdeg) */
  headingSp: number;
  /** Latitude (degE7) */
  latitude: number;
  /** Longitude (degE7) */
  longitude: number;
  /** Altitude above mean sea level (m) */
  altitudeAmsl: number;
  /** Altitude setpoint relative to the home position (m) */
  altitudeSp: number;
  /** airspeed (m/s) */
  airspeed: number;
  /** airspeed setpoint (m/s) */
  airspeedSp: number;
  /** groundspeed (m/s) */
  groundspeed: number;
  /** climb rate (m/s) */
  climbRate: number;
  /** Number of satellites visible. If unknown, set to UINT8_MAX */
  gpsNsat: number;
  /** GPS Fix type. */
  gpsFixType: number;
  /** Remaining battery (percentage) (%) */
  batteryRemaining: number;
  /** Autopilot temperature (degrees C) (degC) */
  temperature: number;
  /** Air temperature (degrees C) from airspeed sensor (degC) */
  temperatureAir: number;
  /** failsafe (each bit represents a failsafe where 0=ok, 1=failsafe active (bit0:RC, bit1:batt, bit2:GPS, bit3:GCS, bit4:fence) */
  failsafe: number;
  /** current waypoint number */
  wpNum: number;
  /** distance to target (m) */
  wpDistance: number;
}

export const HIGH_LATENCY_ID = 234;
export const HIGH_LATENCY_CRC_EXTRA = 150;
export const HIGH_LATENCY_MIN_LENGTH = 40;
export const HIGH_LATENCY_MAX_LENGTH = 40;

export function serializeHighLatency(msg: HighLatency): Uint8Array {
  const buffer = new Uint8Array(40);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.customMode, true);
  view.setInt32(4, msg.latitude, true);
  view.setInt32(8, msg.longitude, true);
  view.setInt16(12, msg.roll, true);
  view.setInt16(14, msg.pitch, true);
  view.setUint16(16, msg.heading, true);
  view.setInt16(18, msg.headingSp, true);
  view.setInt16(20, msg.altitudeAmsl, true);
  view.setInt16(22, msg.altitudeSp, true);
  view.setUint16(24, msg.wpDistance, true);
  buffer[26] = msg.baseMode & 0xff;
  buffer[27] = msg.landedState & 0xff;
  view.setInt8(28, msg.throttle);
  buffer[29] = msg.airspeed & 0xff;
  buffer[30] = msg.airspeedSp & 0xff;
  buffer[31] = msg.groundspeed & 0xff;
  view.setInt8(32, msg.climbRate);
  buffer[33] = msg.gpsNsat & 0xff;
  buffer[34] = msg.gpsFixType & 0xff;
  buffer[35] = msg.batteryRemaining & 0xff;
  view.setInt8(36, msg.temperature);
  view.setInt8(37, msg.temperatureAir);
  buffer[38] = msg.failsafe & 0xff;
  buffer[39] = msg.wpNum & 0xff;

  return buffer;
}

export function deserializeHighLatency(payload: Uint8Array): HighLatency {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    customMode: view.getUint32(0, true),
    latitude: view.getInt32(4, true),
    longitude: view.getInt32(8, true),
    roll: view.getInt16(12, true),
    pitch: view.getInt16(14, true),
    heading: view.getUint16(16, true),
    headingSp: view.getInt16(18, true),
    altitudeAmsl: view.getInt16(20, true),
    altitudeSp: view.getInt16(22, true),
    wpDistance: view.getUint16(24, true),
    baseMode: payload[26],
    landedState: payload[27],
    throttle: view.getInt8(28),
    airspeed: payload[29],
    airspeedSp: payload[30],
    groundspeed: payload[31],
    climbRate: view.getInt8(32),
    gpsNsat: payload[33],
    gpsFixType: payload[34],
    batteryRemaining: payload[35],
    temperature: view.getInt8(36),
    temperatureAir: view.getInt8(37),
    failsafe: payload[38],
    wpNum: payload[39],
  };
}