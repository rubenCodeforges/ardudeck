/**
 * Message appropriate for high latency connections like Iridium (version 2)
 * Message ID: 235
 * CRC Extra: 179
 */
export interface HighLatency2 {
  /** Timestamp (milliseconds since boot or Unix epoch) (ms) */
  timestamp: number;
  /** Type of the MAV (quadrotor, helicopter, etc.) */
  type: number;
  /** Autopilot type / class. Use MAV_AUTOPILOT_INVALID for components that are not flight controllers. */
  autopilot: number;
  /** A bitfield for use for autopilot-specific flags (2 byte version). */
  customMode: number;
  /** Latitude (degE7) */
  latitude: number;
  /** Longitude (degE7) */
  longitude: number;
  /** Altitude above mean sea level (m) */
  altitude: number;
  /** Altitude setpoint (m) */
  targetAltitude: number;
  /** Heading (deg/2) */
  heading: number;
  /** Heading setpoint (deg/2) */
  targetHeading: number;
  /** Distance to target waypoint or position (dam) */
  targetDistance: number;
  /** Throttle (%) */
  throttle: number;
  /** Airspeed (m/s*5) */
  airspeed: number;
  /** Airspeed setpoint (m/s*5) */
  airspeedSp: number;
  /** Groundspeed (m/s*5) */
  groundspeed: number;
  /** Windspeed (m/s*5) */
  windspeed: number;
  /** Wind heading (deg/2) */
  windHeading: number;
  /** Maximum error horizontal position since last message (dm) */
  eph: number;
  /** Maximum error vertical position since last message (dm) */
  epv: number;
  /** Air temperature from airspeed sensor (degC) */
  temperatureAir: number;
  /** Maximum climb rate magnitude since last message (dm/s) */
  climbRate: number;
  /** Battery level (-1 if field not provided). (%) */
  battery: number;
  /** Current waypoint number */
  wpNum: number;
  /** Bitmap of failure flags. */
  failureFlags: number;
  /** Field for custom payload. */
  custom0: number;
  /** Field for custom payload. */
  custom1: number;
  /** Field for custom payload. */
  custom2: number;
}

export const HIGH_LATENCY2_ID = 235;
export const HIGH_LATENCY2_CRC_EXTRA = 179;
export const HIGH_LATENCY2_MIN_LENGTH = 42;
export const HIGH_LATENCY2_MAX_LENGTH = 42;

export function serializeHighLatency2(msg: HighLatency2): Uint8Array {
  const buffer = new Uint8Array(42);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timestamp, true);
  view.setInt32(4, msg.latitude, true);
  view.setInt32(8, msg.longitude, true);
  view.setUint16(12, msg.customMode, true);
  view.setInt16(14, msg.altitude, true);
  view.setInt16(16, msg.targetAltitude, true);
  view.setUint16(18, msg.targetDistance, true);
  view.setUint16(20, msg.wpNum, true);
  view.setUint16(22, msg.failureFlags, true);
  buffer[24] = msg.type & 0xff;
  buffer[25] = msg.autopilot & 0xff;
  buffer[26] = msg.heading & 0xff;
  buffer[27] = msg.targetHeading & 0xff;
  buffer[28] = msg.throttle & 0xff;
  buffer[29] = msg.airspeed & 0xff;
  buffer[30] = msg.airspeedSp & 0xff;
  buffer[31] = msg.groundspeed & 0xff;
  buffer[32] = msg.windspeed & 0xff;
  buffer[33] = msg.windHeading & 0xff;
  buffer[34] = msg.eph & 0xff;
  buffer[35] = msg.epv & 0xff;
  view.setInt8(36, msg.temperatureAir);
  view.setInt8(37, msg.climbRate);
  view.setInt8(38, msg.battery);
  view.setInt8(39, msg.custom0);
  view.setInt8(40, msg.custom1);
  view.setInt8(41, msg.custom2);

  return buffer;
}

export function deserializeHighLatency2(payload: Uint8Array): HighLatency2 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getUint32(0, true),
    latitude: view.getInt32(4, true),
    longitude: view.getInt32(8, true),
    customMode: view.getUint16(12, true),
    altitude: view.getInt16(14, true),
    targetAltitude: view.getInt16(16, true),
    targetDistance: view.getUint16(18, true),
    wpNum: view.getUint16(20, true),
    failureFlags: view.getUint16(22, true),
    type: payload[24],
    autopilot: payload[25],
    heading: payload[26],
    targetHeading: payload[27],
    throttle: payload[28],
    airspeed: payload[29],
    airspeedSp: payload[30],
    groundspeed: payload[31],
    windspeed: payload[32],
    windHeading: payload[33],
    eph: payload[34],
    epv: payload[35],
    temperatureAir: view.getInt8(36),
    climbRate: view.getInt8(37),
    battery: view.getInt8(38),
    custom0: view.getInt8(39),
    custom1: view.getInt8(40),
    custom2: view.getInt8(41),
  };
}