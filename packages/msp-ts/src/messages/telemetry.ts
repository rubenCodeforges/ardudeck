/**
 * MSP Telemetry Messages
 *
 * STATUS, RAW_IMU, ATTITUDE, ALTITUDE, ANALOG, RC, MOTOR, SERVO, RAW_GPS, COMP_GPS
 */

import { MSP } from '../core/constants.js';
import { PayloadReader, PayloadBuilder } from '../core/msp-serializer.js';
import type {
  MSPMessageInfo,
  MSPStatus,
  MSPRawImu,
  MSPAttitude,
  MSPAltitude,
  MSPAnalog,
  MSPRc,
  MSPRxMap,
  MSPMotor,
  MSPServo,
  MSPRawGps,
  MSPCompGps,
  MSPBatteryState,
} from '../core/types.js';

// =============================================================================
// Deserializers
// =============================================================================

/**
 * Deserialize MSP_STATUS response
 *
 * Returns flight controller status including cycle time, sensors, arming state
 */
export function deserializeStatus(payload: Uint8Array): MSPStatus {
  const reader = new PayloadReader(payload);

  const cycleTime = reader.readU16();
  const i2cError = reader.readU16();
  const activeSensors = reader.readU16();
  const flightModeFlags = reader.readU32();
  const currentPidProfile = reader.readU8();

  // Extended status fields (if present)
  let averageSystemLoad = 0;
  let armingDisableFlagsCount = 0;
  let armingDisableFlags = 0;
  let configStateFlags = 0;
  let cpuTemp = 0;

  if (reader.remaining() >= 2) {
    averageSystemLoad = reader.readU16();
  }

  if (reader.remaining() >= 1) {
    armingDisableFlagsCount = reader.readU8();
  }

  if (reader.remaining() >= 4) {
    armingDisableFlags = reader.readU32();
  }

  if (reader.remaining() >= 1) {
    configStateFlags = reader.readU8();
  }

  if (reader.remaining() >= 2) {
    cpuTemp = reader.readU16();
  }

  return {
    cycleTime,
    i2cError,
    activeSensors,
    flightModeFlags,
    currentPidProfile,
    averageSystemLoad,
    armingDisableFlagsCount,
    armingDisableFlags,
    configStateFlags,
    cpuTemp,
  };
}

/**
 * Deserialize MSPV2_INAV_STATUS (0x2000) response
 *
 * iNav-specific status format with different field layout than MSP_STATUS_EX.
 * Returns the same MSPStatus interface for compatibility.
 *
 * Format:
 * - cycleTime: 2 bytes
 * - i2cError: 2 bytes
 * - activeSensors: 2 bytes
 * - cpuload: 2 bytes
 * - profile_byte: 1 byte (profile & battery_profile)
 * - armingFlags: 4 bytes
 * - mspBoxModeFlags: variable (8 bytes typical)
 * - mixer_profile: last byte
 */
export function deserializeInavStatus(payload: Uint8Array): MSPStatus {
  const reader = new PayloadReader(payload);

  const cycleTime = reader.readU16();
  const i2cError = reader.readU16();
  const activeSensors = reader.readU16();
  const averageSystemLoad = reader.readU16(); // cpuload in iNav
  const profileByte = reader.readU8();
  const currentPidProfile = profileByte & 0x0F;
  const armingDisableFlags = reader.readU32();

  // Read flight mode flags if available (variable length in iNav)
  let flightModeFlags = 0;
  if (reader.remaining() >= 4) {
    flightModeFlags = reader.readU32();
  }

  return {
    cycleTime,
    i2cError,
    activeSensors,
    flightModeFlags,
    currentPidProfile,
    averageSystemLoad,
    armingDisableFlagsCount: 32, // iNav uses full 32-bit flag
    armingDisableFlags,
    configStateFlags: 0,
    cpuTemp: 0,
  };
}

/**
 * Deserialize MSP_RAW_IMU response
 *
 * Returns raw sensor data from accelerometer, gyroscope, and magnetometer
 */
export function deserializeRawImu(payload: Uint8Array): MSPRawImu {
  const reader = new PayloadReader(payload);

  return {
    accX: reader.readS16(),
    accY: reader.readS16(),
    accZ: reader.readS16(),
    gyroX: reader.readS16(),
    gyroY: reader.readS16(),
    gyroZ: reader.readS16(),
    magX: reader.readS16(),
    magY: reader.readS16(),
    magZ: reader.readS16(),
  };
}

/**
 * Deserialize MSP_ATTITUDE response
 *
 * Returns attitude angles:
 * - roll/pitch in 0.1 degree units (divide by 10 to get degrees)
 * - yaw/heading in degrees (0-359)
 */
export function deserializeAttitude(payload: Uint8Array): MSPAttitude {
  const reader = new PayloadReader(payload);

  return {
    roll: reader.readS16(), // 0.1 degrees
    pitch: reader.readS16(), // 0.1 degrees
    yaw: reader.readS16(), // degrees
  };
}

/**
 * Deserialize MSP_ALTITUDE response
 *
 * Returns altitude and vertical speed:
 * - altitude in cm (divide by 100 to get meters)
 * - vario in cm/s (divide by 100 to get m/s)
 */
export function deserializeAltitude(payload: Uint8Array): MSPAltitude {
  const reader = new PayloadReader(payload);

  const altitude = reader.readS32(); // cm
  const vario = reader.readS16(); // cm/s

  // Baro altitude (if present)
  let baroAltitude = altitude;
  if (reader.remaining() >= 4) {
    baroAltitude = reader.readS32();
  }

  return {
    altitude,
    vario,
    baroAltitude,
  };
}

/**
 * Deserialize MSP_ANALOG response
 *
 * Returns analog sensor data:
 * - voltage: legacy in 0.1V, or 0.01V for newer firmwares
 * - mAhDrawn: mAh consumed
 * - rssi: 0-1023 scale
 * - current: 0.01A
 */
export function deserializeAnalog(payload: Uint8Array): MSPAnalog {
  const reader = new PayloadReader(payload);

  const voltage = reader.readU8(); // 0.1V (legacy)
  const mAhDrawn = reader.readU16();
  const rssi = reader.readU16();

  // Current (if present)
  let current = 0;
  if (reader.remaining() >= 2) {
    current = reader.readS16(); // 0.01A
  }

  // High-resolution voltage (if present)
  let voltageHr = voltage;
  if (reader.remaining() >= 2) {
    voltageHr = reader.readU16() / 100; // Convert to volts
  }

  return {
    voltage: voltageHr || voltage / 10, // Return in volts
    mAhDrawn,
    rssi,
    current: current / 100, // Return in amps
  };
}

/**
 * Deserialize MSP_RC response
 *
 * Returns RC channel values (typically 16 channels)
 * Values are in PWM microseconds (usually 1000-2000)
 */
export function deserializeRc(payload: Uint8Array): MSPRc {
  const reader = new PayloadReader(payload);
  const channels: number[] = [];

  while (reader.remaining() >= 2) {
    channels.push(reader.readU16());
  }

  return { channels };
}

/**
 * Deserialize MSP_RX_MAP response
 *
 * Returns the RC channel mapping that tells us which channel position
 * corresponds to which stick function.
 *
 * The rxMap array indices represent functions:
 *   0 = Aileron (Roll)
 *   1 = Elevator (Pitch)
 *   2 = Rudder (Yaw)
 *   3 = Throttle
 *   4-7 = AUX1-AUX4
 *
 * The values are the channel positions (0-7).
 *
 * Example: TAER order would be rxMap = [1, 2, 3, 0, 4, 5, 6, 7]
 *   - rxMap[0] = 1 means Aileron is at channel position 1
 *   - rxMap[3] = 0 means Throttle is at channel position 0
 *
 * So to get throttle value: rc.channels[rxMap[3]]
 */
export function deserializeRxMap(payload: Uint8Array): MSPRxMap {
  const rxMap: number[] = [];

  for (let i = 0; i < payload.length; i++) {
    rxMap.push(payload[i]);
  }

  return { rxMap };
}

/**
 * Deserialize MSP_MOTOR response
 *
 * Returns motor output values (typically 4-8 motors)
 * Values are in throttle units (0-2000 or -1000 to +1000 for 3D mode)
 */
export function deserializeMotor(payload: Uint8Array): MSPMotor {
  const reader = new PayloadReader(payload);
  const motors: number[] = [];

  while (reader.remaining() >= 2) {
    motors.push(reader.readU16());
  }

  return { motors };
}

/**
 * Deserialize MSP_SERVO response
 *
 * Returns servo output values
 * Values are in PWM microseconds (usually 1000-2000)
 */
export function deserializeServo(payload: Uint8Array): MSPServo {
  const reader = new PayloadReader(payload);
  const servos: number[] = [];

  while (reader.remaining() >= 2) {
    servos.push(reader.readU16());
  }

  return { servos };
}

/**
 * Deserialize MSP_RAW_GPS response
 *
 * Returns GPS data:
 * - lat/lon in 1/10,000,000 degrees (divide by 10000000 to get decimal degrees)
 * - alt in meters
 * - groundSpeed in cm/s (divide by 100 to get m/s)
 * - groundCourse in 0.1 degrees
 */
export function deserializeRawGps(payload: Uint8Array): MSPRawGps {
  const reader = new PayloadReader(payload);

  const fixType = reader.readU8();
  const numSat = reader.readU8();
  const lat = reader.readS32(); // 1/10000000 degrees
  const lon = reader.readS32(); // 1/10000000 degrees
  const alt = reader.readS16(); // meters
  const groundSpeed = reader.readU16(); // cm/s
  const groundCourse = reader.readU16(); // 0.1 degrees

  // HDOP (if present)
  let hdop = 0;
  if (reader.remaining() >= 2) {
    hdop = reader.readU16();
  }

  return {
    fixType,
    numSat,
    lat,
    lon,
    alt,
    groundSpeed,
    groundCourse,
    hdop,
  };
}

/**
 * GPS data for MSP_SET_RAW_GPS
 */
export interface MSPSetRawGpsData {
  fixType: number;      // 0=no fix, 2=2D, 3=3D
  numSat: number;       // Number of satellites
  lat: number;          // Decimal degrees (will be converted to 1/10000000)
  lon: number;          // Decimal degrees (will be converted to 1/10000000)
  alt: number;          // Meters
  groundSpeed: number;  // m/s (will be converted to cm/s)
  groundCourse: number; // Degrees (will be converted to 0.1 degrees)
  hdop?: number;        // HDOP * 100 (optional)
}

/**
 * Serialize GPS data for MSP_SET_RAW_GPS (201)
 *
 * Used to inject GPS data into flight controller (e.g., for SITL with gps_provider=MSP)
 */
export function serializeSetRawGps(data: MSPSetRawGpsData): Uint8Array {
  const builder = new PayloadBuilder();

  // Convert to MSP format
  const lat = Math.round(data.lat * 10000000);   // Decimal degrees to 1/10000000
  const lon = Math.round(data.lon * 10000000);   // Decimal degrees to 1/10000000
  const alt = Math.round(data.alt);              // Meters (s16)
  const groundSpeed = Math.round(data.groundSpeed * 100);  // m/s to cm/s
  const groundCourse = Math.round(data.groundCourse * 10); // degrees to 0.1 degrees
  const hdop = data.hdop ?? 100;                 // Default HDOP = 1.0

  builder
    .writeU8(data.fixType)
    .writeU8(data.numSat)
    .writeS32(lat)
    .writeS32(lon)
    .writeS16(alt)
    .writeU16(groundSpeed)
    .writeU16(groundCourse)
    .writeU16(hdop);

  return builder.build();
}

/**
 * GPS data for MSP2_SENSOR_GPS (0x1F03)
 * This is the format iNav expects for gps_provider = MSP
 */
export interface MSP2SensorGpsData {
  instance?: number;     // GPS instance (0 = primary)
  fixType: number;       // 0=no fix, 2=2D, 3=3D
  numSat: number;        // Number of satellites
  lat: number;           // Decimal degrees
  lon: number;           // Decimal degrees
  alt: number;           // Meters
  groundSpeed: number;   // m/s
  groundCourse: number;  // Degrees
  velN?: number;         // North velocity m/s
  velE?: number;         // East velocity m/s
  velD?: number;         // Down velocity m/s
  hdop?: number;         // HDOP (actual value, not *100)
  vdop?: number;         // VDOP
  hAcc?: number;         // Horizontal accuracy cm
  vAcc?: number;         // Vertical accuracy cm
}

/**
 * Serialize GPS data for MSP2_SENSOR_GPS (0x1F03)
 *
 * Used to inject GPS data into iNav with gps_provider=MSP
 */
export function serializeMsp2SensorGps(data: MSP2SensorGpsData): Uint8Array {
  const builder = new PayloadBuilder();

  // Calculate GPS time (approximate - just use millis since start)
  const now = Date.now();
  const gpsWeek = Math.floor(now / (7 * 24 * 3600 * 1000)) % 65535;
  const msTOW = now % (7 * 24 * 3600 * 1000);

  // Convert to MSP format
  const lat = Math.round(data.lat * 10000000);   // 1e-7 degrees
  const lon = Math.round(data.lon * 10000000);   // 1e-7 degrees
  const altCm = Math.round(data.alt * 100);      // cm
  const groundSpeed = Math.round(data.groundSpeed * 100);  // cm/s
  const groundCourse = Math.round(data.groundCourse * 100); // 0.01 degrees

  builder
    .writeU8(data.instance ?? 0)         // GPS instance
    .writeU16(gpsWeek)                   // GPS week
    .writeU32(msTOW)                     // Time of week (ms)
    .writeU8(data.fixType)               // Fix type
    .writeU8(data.numSat)                // Number of satellites
    .writeS32(lon)                       // Longitude (note: lon before lat in MSP2)
    .writeS32(lat)                       // Latitude
    .writeS32(altCm)                     // Altitude in cm
    .writeU16(data.hAcc ?? 100)          // Horizontal accuracy cm
    .writeU16(data.vAcc ?? 150)          // Vertical accuracy cm
    .writeS16(Math.round((data.velN ?? 0) * 100))  // North velocity cm/s
    .writeS16(Math.round((data.velE ?? 0) * 100))  // East velocity cm/s
    .writeS16(Math.round((data.velD ?? 0) * 100))  // Down velocity cm/s
    .writeU16(groundSpeed)               // Ground speed cm/s
    .writeS16(groundCourse)              // Ground course 0.01 deg
    .writeU16(Math.round((data.hdop ?? 1.0) * 100))  // HDOP * 100
    .writeU16(Math.round((data.vdop ?? 1.5) * 100)); // VDOP * 100

  return builder.build();
}

/**
 * Deserialize MSP_COMP_GPS response
 *
 * Returns computed GPS values:
 * - distanceToHome in meters
 * - directionToHome in degrees (0-360)
 */
export function deserializeCompGps(payload: Uint8Array): MSPCompGps {
  const reader = new PayloadReader(payload);

  return {
    distanceToHome: reader.readU16(),
    directionToHome: reader.readU16(),
    gpsHeartbeat: reader.readU8(),
  };
}

/**
 * Deserialize MSP_BATTERY_STATE response
 */
export function deserializeBatteryState(payload: Uint8Array): MSPBatteryState {
  const reader = new PayloadReader(payload);

  const cellCount = reader.readU8();
  const capacity = reader.readU16();
  const voltage = reader.readU8(); // 0.1V
  const mAhDrawn = reader.readU16();
  const current = reader.readU16(); // 0.01A
  const state = reader.readU8();

  return {
    cellCount,
    capacity,
    voltage: voltage / 10, // Return in volts
    mAhDrawn,
    current: current / 100, // Return in amps
    state,
  };
}

// =============================================================================
// Conversion Helpers
// =============================================================================

/**
 * Convert MSP attitude values to degrees
 */
export function attitudeToDegrees(attitude: MSPAttitude): {
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
} {
  return {
    rollDeg: attitude.roll / 10,
    pitchDeg: attitude.pitch / 10,
    yawDeg: attitude.yaw,
  };
}

/**
 * Convert MSP altitude to meters
 */
export function altitudeToMeters(altitude: MSPAltitude): {
  altitudeM: number;
  varioMs: number;
} {
  return {
    altitudeM: altitude.altitude / 100,
    varioMs: altitude.vario / 100,
  };
}

/**
 * Convert MSP GPS coordinates to decimal degrees
 */
export function gpsToDecimalDegrees(gps: MSPRawGps): {
  latDeg: number;
  lonDeg: number;
  altM: number;
  speedMs: number;
  courseDeg: number;
} {
  return {
    latDeg: gps.lat / 10000000,
    lonDeg: gps.lon / 10000000,
    altM: gps.alt,
    speedMs: gps.groundSpeed / 100,
    courseDeg: gps.groundCourse / 10,
  };
}

/**
 * Get GPS fix type name
 */
export function getGpsFixTypeName(fixType: number): string {
  const names: Record<number, string> = {
    0: 'No Fix',
    1: 'Dead Reckoning',
    2: '2D Fix',
    3: '3D Fix',
  };
  return names[fixType] ?? `Unknown (${fixType})`;
}

/**
 * Check if armed based on flight mode flags
 */
export function isArmed(flightModeFlags: number): boolean {
  // ARM is bit 0 in the flight mode flags
  return (flightModeFlags & 0x01) !== 0;
}

/**
 * Arming disabled flags for Betaflight/Cleanflight
 * These start at bit 0
 */
const BETAFLIGHT_ARMING_FLAGS: Record<number, string> = {
  0: 'No Gyro',
  1: 'Failsafe',
  2: 'RX Failsafe',
  3: 'Bad RX Recovery',
  4: 'Box Failsafe',
  5: 'Runaway Takeoff',
  6: 'Crash Detected',
  7: 'Throttle',
  8: 'Angle',
  9: 'Boot Grace Time',
  10: 'No Prearm',
  11: 'Load',
  12: 'Calibrating',
  13: 'CLI',
  14: 'CMS Menu',
  15: 'BST',
  16: 'MSP',
  17: 'Paralyze',
  18: 'GPS',
  19: 'Rescue SW',
  20: 'RPM Filter',
  21: 'Reboot Required',
  22: 'DShot Bitbang',
  23: 'Acc Calibration',
  24: 'Motor Protocol',
  25: 'Arm Switch',
};

/**
 * Arming disabled flags for iNav
 * Source: iNav src/main/fc/runtime_config.h
 * Bit positions match (1 << n) - note that bits 0-5 are used for other purposes
 */
const INAV_ARMING_FLAGS: Record<number, string> = {
  6: 'Geozone',
  7: 'Failsafe',
  8: 'Not Level',
  9: 'Calibrating',
  10: 'Overloaded',
  11: 'Nav Unsafe',
  12: 'Compass',
  13: 'Accelerometer',
  14: 'Arm Switch',
  15: 'Hardware Fail',
  16: 'Box Failsafe',
  17: 'Kill Switch',
  18: 'RC Link',
  19: 'Throttle',
  20: 'CLI',
  21: 'CMS Menu',
  22: 'OSD Menu',
  23: 'Roll/Pitch',
  24: 'Autotrim',
  25: 'Out of Memory',
  26: 'Bad Setting',
  27: 'PWM Output',
  28: 'No Prearm',
  29: 'DShot Beeper',
  30: 'Landed',
};

/**
 * Get arming disabled reasons as string array
 * @param flags - The armingDisableFlags bitmask from MSP_STATUS_EX
 * @param fcVariant - Firmware variant: 'INAV', 'BTFL', 'CLFL', etc.
 */
export function getArmingDisabledReasons(flags: number, fcVariant: string = 'BTFL'): string[] {
  const reasons: string[] = [];

  // Select flag mapping based on firmware
  const flagNames = fcVariant === 'INAV' ? INAV_ARMING_FLAGS : BETAFLIGHT_ARMING_FLAGS;

  for (let i = 0; i < 32; i++) {
    if ((flags & (1 << i)) !== 0) {
      const flagName = flagNames[i];
      if (flagName) {
        reasons.push(flagName);
      }
      // Don't add "Unknown" for bits that are not arming flags (e.g., ARMED bit 2)
    }
  }

  return reasons;
}

// =============================================================================
// Box Names and IDs (for dynamic mode mapping)
// =============================================================================

/**
 * Deserialize MSP_BOXNAMES response
 *
 * Returns an array of mode names in slot order.
 * Format is semicolon-delimited string: "ARM;ANGLE;HORIZON;..."
 */
export function deserializeBoxNames(payload: Uint8Array): string[] {
  const names: string[] = [];
  let buffer = '';

  for (let i = 0; i < payload.length; i++) {
    const char = payload[i];
    if (char === 0x3b) { // semicolon delimiter
      if (buffer.length > 0) {
        names.push(buffer);
      }
      buffer = '';
    } else if (char !== 0) { // Skip null bytes
      buffer += String.fromCharCode(char);
    }
  }

  // Handle last name (if no trailing semicolon)
  if (buffer.length > 0) {
    names.push(buffer);
  }

  return names;
}

/**
 * Deserialize MSP_BOXIDS response
 *
 * Returns an array of permanent box IDs in slot order.
 * Each byte is the permanent ID for the mode in that slot.
 */
export function deserializeBoxIds(payload: Uint8Array): number[] {
  const ids: number[] = [];
  for (let i = 0; i < payload.length; i++) {
    ids.push(payload[i]);
  }
  return ids;
}

/**
 * Box mapping - maps slot index to permanent box ID and name
 */
export interface BoxMapping {
  /** Slot index (used in MSP_MODE_RANGES auxChannel) */
  slot: number;
  /** Permanent box ID */
  permanentId: number;
  /** Mode name (e.g., "ARM", "ANGLE", "HORIZON") */
  name: string;
}

/**
 * Build a box mapping from BOXNAMES and BOXIDS responses
 */
export function buildBoxMapping(names: string[], ids: number[]): BoxMapping[] {
  const mapping: BoxMapping[] = [];
  const count = Math.min(names.length, ids.length);

  for (let i = 0; i < count; i++) {
    mapping.push({
      slot: i,
      permanentId: ids[i],
      name: names[i],
    });
  }

  return mapping;
}

// =============================================================================
// Message Info Registry
// =============================================================================

export const TELEMETRY_MESSAGES: MSPMessageInfo[] = [
  {
    command: MSP.STATUS,
    name: 'STATUS',
    minLength: 11,
    maxLength: 32,
    deserialize: deserializeStatus,
  },
  {
    command: MSP.RAW_IMU,
    name: 'RAW_IMU',
    minLength: 18,
    maxLength: 18,
    deserialize: deserializeRawImu,
  },
  {
    command: MSP.ATTITUDE,
    name: 'ATTITUDE',
    minLength: 6,
    maxLength: 6,
    deserialize: deserializeAttitude,
  },
  {
    command: MSP.ALTITUDE,
    name: 'ALTITUDE',
    minLength: 6,
    maxLength: 10,
    deserialize: deserializeAltitude,
  },
  {
    command: MSP.ANALOG,
    name: 'ANALOG',
    minLength: 5,
    maxLength: 9,
    deserialize: deserializeAnalog,
  },
  {
    command: MSP.RC,
    name: 'RC',
    minLength: 2,
    maxLength: 64,
    deserialize: deserializeRc,
  },
  {
    command: MSP.RX_MAP,
    name: 'RX_MAP',
    minLength: 4,
    maxLength: 8,
    deserialize: deserializeRxMap,
  },
  {
    command: MSP.MOTOR,
    name: 'MOTOR',
    minLength: 2,
    maxLength: 16,
    deserialize: deserializeMotor,
  },
  {
    command: MSP.SERVO,
    name: 'SERVO',
    minLength: 2,
    maxLength: 32,
    deserialize: deserializeServo,
  },
  {
    command: MSP.RAW_GPS,
    name: 'RAW_GPS',
    minLength: 16,
    maxLength: 18,
    deserialize: deserializeRawGps,
  },
  {
    command: MSP.COMP_GPS,
    name: 'COMP_GPS',
    minLength: 5,
    maxLength: 5,
    deserialize: deserializeCompGps,
  },
  {
    command: MSP.BATTERY_STATE,
    name: 'BATTERY_STATE',
    minLength: 8,
    maxLength: 8,
    deserialize: deserializeBatteryState,
  },
];
