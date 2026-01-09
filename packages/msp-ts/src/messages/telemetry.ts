/**
 * MSP Telemetry Messages
 *
 * STATUS, RAW_IMU, ATTITUDE, ALTITUDE, ANALOG, RC, MOTOR, SERVO, RAW_GPS, COMP_GPS
 */

import { MSP } from '../core/constants.js';
import { PayloadReader } from '../core/msp-serializer.js';
import type {
  MSPMessageInfo,
  MSPStatus,
  MSPRawImu,
  MSPAttitude,
  MSPAltitude,
  MSPAnalog,
  MSPRc,
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
 * These start at bit 6 (bits 0-5 are used for ARMED, WAS_EVER_ARMED, etc.)
 * Source: inav-configurator/js/gui.js
 */
const INAV_ARMING_FLAGS: Record<number, string> = {
  6: 'Geozone',
  7: 'Failsafe System',
  8: 'Not Level',
  9: 'Sensors Calibrating',
  10: 'System Overloaded',
  11: 'Navigation Unsafe',
  12: 'Compass Not Calibrated',
  13: 'Accelerometer Not Calibrated',
  14: 'Arm Switch',
  15: 'Hardware Failure',
  16: 'Box Failsafe',
  // 17 is BOXKILLSWITCH (commented out in iNav)
  18: 'RC Link',
  19: 'Throttle',
  20: 'CLI',
  21: 'CMS Menu',
  22: 'OSD Menu',
  23: 'Roll/Pitch Not Centered',
  24: 'Servo Autotrim',
  25: 'Out of Memory',
  26: 'Invalid Setting',
  27: 'PWM Output Error',
  28: 'No Prearm',
  29: 'DShot Beeper',
  30: 'Landing Detected',
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
