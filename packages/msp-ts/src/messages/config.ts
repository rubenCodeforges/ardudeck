/**
 * MSP Configuration Messages
 *
 * PID, RC_TUNING, MODE_RANGES, FEATURE_CONFIG
 */

import { MSP } from '../core/constants.js';
import { PayloadReader, PayloadBuilder } from '../core/msp-serializer.js';

// =============================================================================
// Types
// =============================================================================

export interface MSPPidCoefficients {
  p: number;
  i: number;
  d: number;
}

export interface MSPPid {
  roll: MSPPidCoefficients;
  pitch: MSPPidCoefficients;
  yaw: MSPPidCoefficients;
  // Additional PID controllers (if present)
  altHold?: MSPPidCoefficients;
  posHold?: MSPPidCoefficients;
  posR?: MSPPidCoefficients;
  navR?: MSPPidCoefficients;
  level?: MSPPidCoefficients;
  mag?: MSPPidCoefficients;
  vel?: MSPPidCoefficients;
}

export interface MSPRcTuning {
  rcRate: number;           // RC rate (0-255, represents 0.01-2.55)
  rcExpo: number;           // RC expo (0-100)
  rollPitchRate: number;    // Legacy: combined roll/pitch rate
  yawRate: number;          // Yaw rate
  dynThrPID: number;        // Dynamic throttle PID
  throttleMid: number;      // Throttle mid position
  throttleExpo: number;     // Throttle expo
  tpaBreakpoint: number;    // TPA breakpoint
  rcYawExpo: number;        // RC yaw expo
  rcYawRate: number;        // RC yaw rate
  rcPitchRate: number;      // RC pitch rate
  rcPitchExpo: number;      // RC pitch expo
  rollRate: number;         // Roll super rate
  pitchRate: number;        // Pitch super rate
  yawRateLimit: number;     // Yaw rate limit (Betaflight 4.x)
  ratesType: number;        // Rates type (0=Betaflight, 1=Raceflight, 2=Kiss, 3=Actual, 4=Quick)
}

export interface MSPModeRange {
  boxId: number;        // Mode ID (see MSP_FLIGHT_MODE in constants)
  auxChannel: number;   // AUX channel (0=AUX1, 1=AUX2, etc.)
  rangeStart: number;   // Start of range (900-2100, in steps of 25)
  rangeEnd: number;     // End of range (900-2100, in steps of 25)
}

export interface MSPFeatureConfig {
  features: number;     // Bitmask of enabled features
}

export interface MSPMixerConfig {
  mixer: number;        // Mixer type (see MIXER_TYPES)
  reversedMotors?: boolean;
}

/**
 * iNav-specific mixer configuration (MSP2_INAV_MIXER)
 * This is the CORRECT way to change platform type on iNav boards.
 */
export interface MSPInavMixerConfig {
  yawMotorDirection: number;      // -1 or 1
  yawJumpPreventionLimit: number; // 0-255
  motorStopOnLow: number;         // 0 or 1
  platformType: number;           // 0=multirotor, 1=airplane, 2=helicopter, 3=tricopter
  hasFlaps: number;               // 0 or 1
  appliedMixerPreset: number;     // Preset ID (int16)
  numberOfMotors: number;         // Read-only from FC
  numberOfServos: number;         // Read-only from FC
}

// =============================================================================
// Deserializers
// =============================================================================

/**
 * Deserialize MSP_PID response
 *
 * Returns PID coefficients for roll, pitch, yaw (and optionally more)
 * Each value is 0-255
 */
export function deserializePid(payload: Uint8Array): MSPPid {
  const reader = new PayloadReader(payload);

  // Read PID triplets (P, I, D for each controller)
  const readPid = (): MSPPidCoefficients => ({
    p: reader.readU8(),
    i: reader.readU8(),
    d: reader.readU8(),
  });

  const pid: MSPPid = {
    roll: readPid(),
    pitch: readPid(),
    yaw: readPid(),
  };

  // Optional additional PIDs
  if (reader.remaining() >= 3) pid.altHold = readPid();
  if (reader.remaining() >= 3) pid.posHold = readPid();
  if (reader.remaining() >= 3) pid.posR = readPid();
  if (reader.remaining() >= 3) pid.navR = readPid();
  if (reader.remaining() >= 3) pid.level = readPid();
  if (reader.remaining() >= 3) pid.mag = readPid();
  if (reader.remaining() >= 3) pid.vel = readPid();

  return pid;
}

/**
 * Serialize MSP_SET_PID payload
 */
export function serializePid(pid: MSPPid): Uint8Array {
  const builder = new PayloadBuilder();

  const writePid = (p: MSPPidCoefficients) => {
    builder.writeU8(p.p);
    builder.writeU8(p.i);
    builder.writeU8(p.d);
  };

  writePid(pid.roll);
  writePid(pid.pitch);
  writePid(pid.yaw);

  // Write optional PIDs if present
  if (pid.altHold) writePid(pid.altHold);
  if (pid.posHold) writePid(pid.posHold);
  if (pid.posR) writePid(pid.posR);
  if (pid.navR) writePid(pid.navR);
  if (pid.level) writePid(pid.level);
  if (pid.mag) writePid(pid.mag);
  if (pid.vel) writePid(pid.vel);

  return builder.build();
}

/**
 * Deserialize MSP_RC_TUNING response
 *
 * Returns rate/expo settings
 */
export function deserializeRcTuning(payload: Uint8Array): MSPRcTuning {
  const reader = new PayloadReader(payload);

  const rcTuning: MSPRcTuning = {
    rcRate: reader.readU8(),
    rcExpo: reader.readU8(),
    rollPitchRate: reader.readU8(),
    yawRate: reader.readU8(),
    dynThrPID: reader.readU8(),
    throttleMid: reader.readU8(),
    throttleExpo: reader.readU8(),
    tpaBreakpoint: reader.remaining() >= 2 ? reader.readU16() : 1500,
    rcYawExpo: reader.remaining() >= 1 ? reader.readU8() : 0,
    rcYawRate: reader.remaining() >= 1 ? reader.readU8() : 0,
    rcPitchRate: reader.remaining() >= 1 ? reader.readU8() : 0,
    rcPitchExpo: reader.remaining() >= 1 ? reader.readU8() : 0,
    rollRate: reader.remaining() >= 1 ? reader.readU8() : 0,
    pitchRate: reader.remaining() >= 1 ? reader.readU8() : 0,
    yawRateLimit: reader.remaining() >= 2 ? reader.readU16() : 0,
    ratesType: reader.remaining() >= 1 ? reader.readU8() : 0,
  };

  return rcTuning;
}

/**
 * Deserialize MSP_RC_TUNING response for iNav (11 bytes)
 *
 * iNav format (from MSPHelper.js):
 * - Byte 0: RC_RATE (fixed at 100)
 * - Byte 1: RC_EXPO (0-100)
 * - Byte 2: roll_rate (stored/10, so 4 = 40°/s)
 * - Byte 3: pitch_rate (stored/10)
 * - Byte 4: yaw_rate (stored/10)
 * - Byte 5: dynamic_THR_PID (TPA)
 * - Byte 6: throttle_MID (0-100)
 * - Byte 7: throttle_EXPO (0-100)
 * - Bytes 8-9: TPA breakpoint (16-bit LE)
 * - Byte 10: RC_YAW_EXPO (0-100)
 */
export function deserializeRcTuningInav(payload: Uint8Array): MSPRcTuning {
  const reader = new PayloadReader(payload);

  // Read raw bytes first
  const rcRate = reader.readU8();      // 0: RC_RATE (fixed at 100 for iNav)
  const rcExpo = reader.readU8();      // 1: RC_EXPO
  const rollRateRaw = reader.readU8(); // 2: roll_rate / 10
  const pitchRateRaw = reader.readU8();// 3: pitch_rate / 10
  const yawRateRaw = reader.readU8();  // 4: yaw_rate / 10
  const dynThrPID = reader.readU8();   // 5: TPA
  const throttleMid = reader.readU8(); // 6: throttle mid
  const throttleExpo = reader.readU8();// 7: throttle expo
  const tpaBreakpoint = reader.remaining() >= 2 ? reader.readU16() : 1500; // 8-9: TPA breakpoint
  const rcYawExpo = reader.remaining() >= 1 ? reader.readU8() : 0; // 10: yaw expo

  // Convert rates: stored as /10, so multiply by 10 to get °/s
  const rollRate = rollRateRaw * 10;
  const pitchRate = pitchRateRaw * 10;
  const yawRate = yawRateRaw * 10;

  return {
    rcRate: 100, // Fixed for iNav
    rcExpo,
    rollPitchRate: rollRate, // Legacy: use roll rate
    yawRate,
    dynThrPID,
    throttleMid,
    throttleExpo,
    tpaBreakpoint,
    rcYawExpo,
    // iNav uses fixed values for these
    rcYawRate: 100,
    rcPitchRate: 100,
    // iNav uses same rcExpo for both Roll AND Pitch (shared expo)
    rcPitchExpo: rcExpo,
    rollRate,
    pitchRate,
    yawRateLimit: 0,
    ratesType: 0,
  };
}

/**
 * Serialize MSP_SET_RC_TUNING payload
 */
export function serializeRcTuning(rcTuning: MSPRcTuning): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(rcTuning.rcRate);
  builder.writeU8(rcTuning.rcExpo);
  builder.writeU8(rcTuning.rollPitchRate);
  builder.writeU8(rcTuning.yawRate);
  builder.writeU8(rcTuning.dynThrPID);
  builder.writeU8(rcTuning.throttleMid);
  builder.writeU8(rcTuning.throttleExpo);
  builder.writeU16(rcTuning.tpaBreakpoint);
  builder.writeU8(rcTuning.rcYawExpo);
  builder.writeU8(rcTuning.rcYawRate);
  builder.writeU8(rcTuning.rcPitchRate);
  builder.writeU8(rcTuning.rcPitchExpo);
  builder.writeU8(rcTuning.rollRate);
  builder.writeU8(rcTuning.pitchRate);
  builder.writeU16(rcTuning.yawRateLimit);
  builder.writeU8(rcTuning.ratesType);

  return builder.build();
}

/**
 * Serialize MSP_SET_RC_TUNING payload for iNav (11 bytes)
 *
 * iNav format from MSPHelper.js:
 * - Byte 0: RC_RATE * 100 (always 100 for iNav)
 * - Byte 1: RC_EXPO (0-100)
 * - Byte 2: roll_rate / 10 (so 400°/s → 40)
 * - Byte 3: pitch_rate / 10
 * - Byte 4: yaw_rate / 10
 * - Byte 5: dynamic_THR_PID (TPA)
 * - Byte 6: throttle_MID (0-100)
 * - Byte 7: throttle_EXPO (0-100)
 * - Bytes 8-9: TPA breakpoint (16-bit LE)
 * - Byte 10: RC_YAW_EXPO (0-100)
 */
export function serializeRcTuningInav(rcTuning: MSPRcTuning): Uint8Array {
  const builder = new PayloadBuilder();

  // RC_RATE - fixed at 100 for iNav
  builder.writeU8(100);

  // RC_EXPO - stored as 0-100
  builder.writeU8(Math.round(rcTuning.rcExpo || 0));

  // Rates: iNav stores as rate/10, so 400°/s = 40
  // Our rcTuning has values in °/s from the UI (40 = 40°/s)
  const rollRate = rcTuning.rollRate || rcTuning.rollPitchRate || 40;
  const pitchRate = rcTuning.pitchRate || rcTuning.rollPitchRate || 40;
  const yawRate = rcTuning.yawRate || 40;

  // Divide by 10 for wire format, clamp to valid range 4-100 (= 40-1000°/s)
  builder.writeU8(Math.max(4, Math.min(100, Math.round(rollRate / 10))));
  builder.writeU8(Math.max(4, Math.min(100, Math.round(pitchRate / 10))));
  builder.writeU8(Math.max(4, Math.min(100, Math.round(yawRate / 10))));

  // TPA (0-100)
  builder.writeU8(rcTuning.dynThrPID || 0);

  // Throttle mid (0-100)
  builder.writeU8(rcTuning.throttleMid || 50);

  // Throttle expo (0-100)
  builder.writeU8(rcTuning.throttleExpo || 0);

  // TPA breakpoint (16-bit LE)
  builder.writeU16(rcTuning.tpaBreakpoint || 1500);

  // RC_YAW_EXPO (0-100)
  builder.writeU8(Math.round(rcTuning.rcYawExpo || 0));

  return builder.build();
}

/**
 * Deserialize MSP_MODE_RANGES response
 *
 * Returns array of mode range configurations
 */
export function deserializeModeRanges(payload: Uint8Array): MSPModeRange[] {
  const reader = new PayloadReader(payload);
  const modes: MSPModeRange[] = [];

  // Each mode range is 4 bytes
  while (reader.remaining() >= 4) {
    const boxId = reader.readU8();
    const auxChannel = reader.readU8();
    const rangeStartStep = reader.readU8();
    const rangeEndStep = reader.readU8();

    // Convert step values to PWM (step 0 = 900, step 48 = 2100)
    modes.push({
      boxId,
      auxChannel,
      rangeStart: 900 + rangeStartStep * 25,
      rangeEnd: 900 + rangeEndStep * 25,
    });
  }

  return modes;
}

/**
 * Serialize a single MSP_SET_MODE_RANGE payload
 *
 * Note: SET_MODE_RANGE sets one range at a time, index is prepended
 */
export function serializeModeRange(index: number, mode: MSPModeRange): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(index);
  builder.writeU8(mode.boxId);
  builder.writeU8(mode.auxChannel);
  builder.writeU8(Math.round((mode.rangeStart - 900) / 25));
  builder.writeU8(Math.round((mode.rangeEnd - 900) / 25));

  return builder.build();
}

/**
 * Deserialize MSP_FEATURE_CONFIG response
 */
export function deserializeFeatureConfig(payload: Uint8Array): MSPFeatureConfig {
  const reader = new PayloadReader(payload);

  return {
    features: reader.readU32(),
  };
}

/**
 * Serialize MSP_SET_FEATURE_CONFIG payload
 */
export function serializeFeatureConfig(config: MSPFeatureConfig): Uint8Array {
  const builder = new PayloadBuilder();
  builder.writeU32(config.features);
  return builder.build();
}

/**
 * Deserialize MSP_MIXER_CONFIG response
 */
export function deserializeMixerConfig(payload: Uint8Array): MSPMixerConfig {
  const reader = new PayloadReader(payload);

  const config: MSPMixerConfig = {
    mixer: reader.readU8(),
  };

  // Optional: reversed motors flag (if present)
  if (reader.remaining() >= 1) {
    config.reversedMotors = reader.readU8() === 1;
  }

  return config;
}

/**
 * Serialize MSP_SET_MIXER_CONFIG payload
 */
export function serializeMixerConfig(mixerType: number): Uint8Array {
  const builder = new PayloadBuilder();
  builder.writeU8(mixerType);
  // Note: Some firmware versions expect reversed_motors byte, but for basic
  // mixer changes we just send the mixer type. A reboot is typically required.
  return builder.build();
}

/**
 * Deserialize MSP2_INAV_MIXER response
 *
 * This is the proper iNav command for reading platform configuration.
 * Use platformType to determine if board is multirotor (0) or airplane (1).
 */
export function deserializeInavMixerConfig(payload: Uint8Array): MSPInavMixerConfig {
  const reader = new PayloadReader(payload);

  return {
    yawMotorDirection: reader.readS8(),
    yawJumpPreventionLimit: reader.readU8(),
    motorStopOnLow: reader.readU8(),
    platformType: reader.readS8(),
    hasFlaps: reader.readS8(),
    appliedMixerPreset: reader.readS16(),
    numberOfMotors: reader.readS8(),
    numberOfServos: reader.readS8(),
  };
}

/**
 * Serialize MSP2_INAV_SET_MIXER payload
 *
 * This is the proper iNav command for changing platform type.
 * platformType: 0=multirotor, 1=airplane, 2=helicopter, 3=tricopter
 */
export function serializeInavMixerConfig(config: MSPInavMixerConfig): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeS8(config.yawMotorDirection);
  builder.writeU8(config.yawJumpPreventionLimit);
  builder.writeU8(config.motorStopOnLow);
  builder.writeS8(config.platformType);
  builder.writeS8(config.hasFlaps);
  builder.writeS16(config.appliedMixerPreset);
  builder.writeU8(0);  // Filler byte
  builder.writeU8(0);  // Filler byte

  return builder.build();
}

/**
 * Check if iNav platformType is a multirotor type
 */
export function isInavMultirotor(platformType: number): boolean {
  // 0 = MULTIROTOR, 3 = TRICOPTER
  return platformType === 0 || platformType === 3;
}

/**
 * Check if iNav platformType is a fixed-wing type
 */
export function isInavFixedWing(platformType: number): boolean {
  // 1 = AIRPLANE
  return platformType === 1;
}

// =============================================================================
// Mixer Types
// =============================================================================

/**
 * Mixer type IDs from Betaflight/iNav
 */
export const MIXER_TYPES: Record<number, { name: string; isMultirotor: boolean; isPlane: boolean }> = {
  0: { name: 'TRI', isMultirotor: true, isPlane: false },
  1: { name: 'QUADP', isMultirotor: true, isPlane: false },
  2: { name: 'QUADP', isMultirotor: true, isPlane: false },
  3: { name: 'QUADX', isMultirotor: true, isPlane: false },
  4: { name: 'BICOPTER', isMultirotor: true, isPlane: false },
  5: { name: 'GIMBAL', isMultirotor: false, isPlane: false },
  6: { name: 'Y6', isMultirotor: true, isPlane: false },
  7: { name: 'HEX6', isMultirotor: true, isPlane: false },
  8: { name: 'FLYING_WING', isMultirotor: false, isPlane: true },
  9: { name: 'Y4', isMultirotor: true, isPlane: false },
  10: { name: 'HEX6X', isMultirotor: true, isPlane: false },
  11: { name: 'OCTOX8', isMultirotor: true, isPlane: false },
  12: { name: 'OCTOFLATP', isMultirotor: true, isPlane: false },
  13: { name: 'OCTOFLATX', isMultirotor: true, isPlane: false },
  14: { name: 'AIRPLANE', isMultirotor: false, isPlane: true },
  15: { name: 'HELI_120_CCPM', isMultirotor: false, isPlane: false },
  16: { name: 'HELI_90_DEG', isMultirotor: false, isPlane: false },
  17: { name: 'VTAIL4', isMultirotor: true, isPlane: false },
  18: { name: 'HEX6H', isMultirotor: true, isPlane: false },
  20: { name: 'DUALCOPTER', isMultirotor: true, isPlane: false },
  21: { name: 'SINGLECOPTER', isMultirotor: true, isPlane: false },
  22: { name: 'ATAIL4', isMultirotor: true, isPlane: false },
  23: { name: 'CUSTOM', isMultirotor: false, isPlane: false },
  24: { name: 'CUSTOM_AIRPLANE', isMultirotor: false, isPlane: true },
  25: { name: 'CUSTOM_TRI', isMultirotor: true, isPlane: false },
};

/**
 * Check if mixer type is a multirotor (quad, hex, etc.)
 */
export function isMultirotorMixer(mixerType: number): boolean {
  return MIXER_TYPES[mixerType]?.isMultirotor ?? false;
}

/**
 * Check if mixer type requires servo setup (plane, flying wing, etc.)
 */
export function isPlaneMixer(mixerType: number): boolean {
  return MIXER_TYPES[mixerType]?.isPlane ?? false;
}

/**
 * Get mixer name from type ID
 */
export function getMixerName(mixerType: number): string {
  return MIXER_TYPES[mixerType]?.name ?? `Unknown (${mixerType})`;
}

// =============================================================================
// Feature Flags
// =============================================================================

export const FEATURE_FLAGS: Record<number, string> = {
  0: 'RX_PPM',
  2: 'INFLIGHT_ACC_CAL',
  3: 'RX_SERIAL',
  4: 'MOTOR_STOP',
  5: 'SERVO_TILT',
  6: 'SOFTSERIAL',
  7: 'GPS',
  9: 'SONAR',
  10: 'TELEMETRY',
  12: '3D',
  13: 'RX_PARALLEL_PWM',
  14: 'RX_MSP',
  15: 'RSSI_ADC',
  16: 'LED_STRIP',
  17: 'DISPLAY',
  18: 'OSD',
  20: 'CHANNEL_FORWARDING',
  21: 'TRANSPONDER',
  22: 'AIRMODE',
  25: 'RX_SPI',
  27: 'ESC_SENSOR',
  28: 'ANTI_GRAVITY',
  29: 'DYNAMIC_FILTER',
};

/**
 * Get list of enabled feature names from bitmask
 */
export function getEnabledFeatures(featureMask: number): string[] {
  const enabled: string[] = [];
  for (const [bit, name] of Object.entries(FEATURE_FLAGS)) {
    if ((featureMask & (1 << parseInt(bit))) !== 0) {
      enabled.push(name);
    }
  }
  return enabled;
}

// =============================================================================
// Mode Names
// =============================================================================

export const MODE_NAMES: Record<number, string> = {
  0: 'ARM',
  1: 'ANGLE',
  2: 'HORIZON',
  3: 'MAG',
  4: 'HEADFREE',
  5: 'PASSTHRU',
  6: 'FAILSAFE',
  7: 'GPS RESCUE',
  8: 'ANTI GRAVITY',
  13: 'BEEPER',
  15: 'LED LOW',
  19: 'OSD DISABLE',
  26: 'BLACKBOX',
  28: 'AIRMODE',
  35: 'PID AUDIO',
  36: 'PARALYZE',
  39: 'BEEPER GPS',
  40: 'VTX CONTROL',
  41: 'LAUNCH CONTROL',
};

/**
 * Get mode name from box ID
 */
export function getModeName(boxId: number): string {
  return MODE_NAMES[boxId] ?? `MODE ${boxId}`;
}

// =============================================================================
// Rate Type Names
// =============================================================================

export const RATES_TYPE_NAMES: Record<number, string> = {
  0: 'Betaflight',
  1: 'Raceflight',
  2: 'KISS',
  3: 'Actual',
  4: 'Quick',
};

// =============================================================================
// Servo Configuration Types (iNav/Betaflight)
// =============================================================================

export interface MSPServoConfig {
  min: number;              // Minimum PWM (typically 1000)
  max: number;              // Maximum PWM (typically 2000)
  middle: number;           // Center/neutral PWM (typically 1500)
  rate: number;             // Servo rate/scaling (-100 to +100)
  forwardFromChannel: number; // Forward RC channel (255 = disabled)
  reversedSources: number;  // Bitfield of reversed input sources
}

export interface MSPServoMixerRule {
  targetChannel: number;    // Servo output index (0-7)
  inputSource: number;      // Input source (see SERVO_INPUT_SOURCE)
  rate: number;             // Mix rate (-125 to +125, percentage)
  speed: number;            // Speed limiting (0 = none, 1-255 = slower)
  min: number;              // Min output override (-100 to 0, 0 = no limit)
  max: number;              // Max output override (0 to 100, 0 = no limit)
  box: number;              // Activation mode box ID (0 = always active)
}

// Servo input sources (for mixer rules)
export const SERVO_INPUT_SOURCE = {
  STABILIZED_ROLL: 0,
  STABILIZED_PITCH: 1,
  STABILIZED_YAW: 2,
  STABILIZED_THROTTLE: 3,
  RC_ROLL: 4,
  RC_PITCH: 5,
  RC_YAW: 6,
  RC_THROTTLE: 7,
  RC_AUX1: 8,
  RC_AUX2: 9,
  RC_AUX3: 10,
  RC_AUX4: 11,
  GIMBAL_PITCH: 12,
  GIMBAL_ROLL: 13,
  FLAPERON: 14,      // iNav
  HEADTRACKER: 15,   // iNav
  MANUAL_RC: 16,     // iNav - direct RC input
} as const;

export const SERVO_INPUT_SOURCE_NAMES: Record<number, string> = {
  0: 'Stabilized Roll',
  1: 'Stabilized Pitch',
  2: 'Stabilized Yaw',
  3: 'Stabilized Throttle',
  4: 'RC Roll',
  5: 'RC Pitch',
  6: 'RC Yaw',
  7: 'RC Throttle',
  8: 'AUX 1',
  9: 'AUX 2',
  10: 'AUX 3',
  11: 'AUX 4',
  12: 'Gimbal Pitch',
  13: 'Gimbal Roll',
  14: 'Flaperon',
  15: 'Headtracker',
  16: 'Manual RC',
};

/**
 * Deserialize MSP_SERVO_CONFIGURATIONS response
 * Returns array of servo configurations (typically 8 servos)
 *
 * Format detection:
 * - iNav uses 7 bytes per servo: min(2) + max(2) + middle(2) + rate(1)
 * - Betaflight uses 12 bytes per servo: min(2) + max(2) + middle(2) + rate(1) + forward(1) + reversed(4)
 */
export function deserializeServoConfigurations(payload: Uint8Array): MSPServoConfig[] {
  const reader = new PayloadReader(payload);
  const servos: MSPServoConfig[] = [];

  // Detect format based on payload size
  // Old Betaflight/iNav: 14 bytes per servo (min, max, mid, rate, 2 padding, forward, reversed)
  // New iNav MSP2: 7 bytes per servo (min, max, mid, rate) - but we use MSP_SERVO_CONFIGURATIONS (120)
  // 112 bytes = 8 servos × 14 bytes (Betaflight/old iNav format)
  const bytesPerServo = payload.length % 14 === 0 ? 14 : (payload.length % 7 === 0 ? 7 : 14);

  console.log(`[MSP] Servo format detection: ${payload.length} bytes, using ${bytesPerServo}-byte format`);

  if (bytesPerServo === 7) {
    // New iNav MSP2 format: 7 bytes per servo
    while (reader.remaining() >= 7) {
      servos.push({
        min: reader.readU16(),
        max: reader.readU16(),
        middle: reader.readU16(),
        rate: reader.readS8(),
        forwardFromChannel: 255,
        reversedSources: 0,
      });
    }
  } else {
    // Betaflight/old iNav format: 14 bytes per servo
    while (reader.remaining() >= 14) {
      const min = reader.readU16();
      const max = reader.readU16();
      const middle = reader.readU16();
      const rate = reader.readS8();
      reader.skip(2); // 2 padding bytes
      const forwardFromChannel = reader.readU8();
      const reversedSources = reader.readU32();
      servos.push({ min, max, middle, rate, forwardFromChannel, reversedSources });
    }
  }

  return servos;
}

/**
 * Serialize MSP_SET_SERVO_CONFIGURATION payload
 * Sets configuration for a single servo by index
 */
export function serializeServoConfiguration(index: number, config: MSPServoConfig): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(index);
  builder.writeU16(config.min);
  builder.writeU16(config.max);
  builder.writeU16(config.middle);
  builder.writeS8(config.rate);
  builder.writeU8(config.forwardFromChannel);
  builder.writeU32(config.reversedSources);

  return builder.build();
}

/**
 * Deserialize MSP_SERVO response (live servo values)
 * Returns array of current servo PWM values
 */
export function deserializeServoValues(payload: Uint8Array): number[] {
  const reader = new PayloadReader(payload);
  const values: number[] = [];

  while (reader.remaining() >= 2) {
    values.push(reader.readU16());
  }

  return values;
}

// =============================================================================
// iNav Servo Mixer Rules (MSP2_INAV_SERVO_MIXER)
// =============================================================================

/**
 * Deserialize iNav servo mixer rules
 */
export function deserializeServoMixerRules(payload: Uint8Array): MSPServoMixerRule[] {
  const reader = new PayloadReader(payload);
  const rules: MSPServoMixerRule[] = [];

  // Each rule is 7 bytes in iNav
  while (reader.remaining() >= 7) {
    rules.push({
      targetChannel: reader.readU8(),
      inputSource: reader.readU8(),
      rate: reader.readS8(),
      speed: reader.readU8(),
      min: reader.readS8(),
      max: reader.readS8(),
      box: reader.readU8(),
    });
  }

  return rules;
}

/**
 * Serialize a single iNav servo mixer rule
 */
export function serializeServoMixerRule(index: number, rule: MSPServoMixerRule): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(index);
  builder.writeU8(rule.targetChannel);
  builder.writeU8(rule.inputSource);
  builder.writeS8(rule.rate);
  builder.writeU8(rule.speed);
  builder.writeS8(rule.min);
  builder.writeS8(rule.max);
  builder.writeU8(rule.box);

  return builder.build();
}

// =============================================================================
// iNav Navigation Settings
// =============================================================================

export interface MSPNavConfig {
  // General navigation
  userControlMode: number;       // User control mode (0=GPS, 1=NAV_ALTHOLD, etc.)
  maxNavigationSpeed: number;    // Max nav speed in cm/s
  maxClimbRate: number;          // Max climb rate in cm/s
  maxManualSpeed: number;        // Max manual speed in cm/s
  maxManualClimbRate: number;    // Max manual climb rate in cm/s
  landDescendRate: number;       // Landing descent rate cm/s
  landSlowdownMinAlt: number;    // Altitude to start slowing down landing (cm)
  landSlowdownMaxAlt: number;    // Altitude to be at min speed (cm)
  emergencyDescentRate: number;  // Emergency descent rate cm/s
  // RTH settings
  rthAltControlMode: number;     // RTH altitude mode (0=current, 1=extra, 2=fixed, 3=max, 4=at_least)
  rthAbortThreshold: number;     // Abort RTH if closer than this (m)
  rthAltitude: number;           // RTH altitude in cm
  // Waypoint settings
  waypointRadius: number;        // WP reached radius in cm
  waypointSafeAlt: number;       // Safe altitude for WP missions in cm
  // Position hold
  maxBankAngle: number;          // Max bank angle (degrees * 10)
  // Cruise
  useThrottleMidForAlthold: boolean;
  hoverThrottle: number;         // Hover throttle (0-1000)
}

export const NAV_RTH_ALT_MODE = {
  CURRENT: 0,       // Return at current altitude
  EXTRA: 1,         // Return at current + extra altitude
  FIXED: 2,         // Return at fixed altitude
  MAX: 3,           // Return at max of current/fixed
  AT_LEAST: 4,      // Return at least at fixed altitude
} as const;

export const NAV_RTH_ALT_MODE_NAMES: Record<number, string> = {
  0: 'Current',
  1: 'Extra',
  2: 'Fixed',
  3: 'Max',
  4: 'At Least',
};

/**
 * Deserialize MSP2_INAV_NAV_POSHOLD response
 */
export function deserializeNavPoshold(payload: Uint8Array): Partial<MSPNavConfig> {
  const reader = new PayloadReader(payload);

  return {
    userControlMode: reader.readU8(),
    maxNavigationSpeed: reader.readU16(),
    maxClimbRate: reader.readU16(),
    maxManualSpeed: reader.readU16(),
    maxManualClimbRate: reader.readU16(),
    maxBankAngle: reader.readU8(),
    useThrottleMidForAlthold: reader.readU8() === 1,
    hoverThrottle: reader.readU16(),
  };
}

/**
 * Deserialize MSP_NAV_CONFIG response (iNav)
 */
export function deserializeNavConfig(payload: Uint8Array): Partial<MSPNavConfig> {
  const reader = new PayloadReader(payload);

  // Structure varies by iNav version, handle common fields
  const config: Partial<MSPNavConfig> = {};

  if (reader.remaining() >= 2) {
    config.maxNavigationSpeed = reader.readU16();
  }
  if (reader.remaining() >= 2) {
    config.maxClimbRate = reader.readU16();
  }
  if (reader.remaining() >= 2) {
    config.waypointRadius = reader.readU16();
  }
  if (reader.remaining() >= 2) {
    config.waypointSafeAlt = reader.readU16();
  }
  if (reader.remaining() >= 1) {
    config.rthAltControlMode = reader.readU8();
  }
  if (reader.remaining() >= 2) {
    config.rthAltitude = reader.readU16();
  }
  if (reader.remaining() >= 2) {
    config.landDescendRate = reader.readU16();
  }
  if (reader.remaining() >= 2) {
    config.landSlowdownMinAlt = reader.readU16();
  }
  if (reader.remaining() >= 2) {
    config.landSlowdownMaxAlt = reader.readU16();
  }
  if (reader.remaining() >= 2) {
    config.emergencyDescentRate = reader.readU16();
  }

  return config;
}

/**
 * Serialize MSP_SET_NAV_CONFIG payload
 */
export function serializeNavConfig(config: Partial<MSPNavConfig>): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU16(config.maxNavigationSpeed ?? 300);    // cm/s
  builder.writeU16(config.maxClimbRate ?? 500);          // cm/s
  builder.writeU16(config.waypointRadius ?? 100);        // cm
  builder.writeU16(config.waypointSafeAlt ?? 2000);      // cm
  builder.writeU8(config.rthAltControlMode ?? 0);
  builder.writeU16(config.rthAltitude ?? 1000);          // cm
  builder.writeU16(config.landDescendRate ?? 200);       // cm/s
  builder.writeU16(config.landSlowdownMinAlt ?? 500);    // cm
  builder.writeU16(config.landSlowdownMaxAlt ?? 200);    // cm
  builder.writeU16(config.emergencyDescentRate ?? 500);  // cm/s

  return builder.build();
}

// =============================================================================
// iNav GPS Config
// =============================================================================

export interface MSPGpsConfig {
  provider: number;         // GPS provider (0=NMEA, 1=UBLOX, 2=MSP, etc.)
  sbasMode: number;         // SBAS mode (0=auto, 1=disabled, 2=enabled)
  autoConfig: boolean;      // Auto-configure GPS
  autoBaud: boolean;        // Auto-detect baud rate
  homePointOnce: boolean;   // Set home point once
  ubloxUseGalileo: boolean; // Enable Galileo
}

export const GPS_PROVIDER = {
  NMEA: 0,
  UBLOX: 1,
  MSP: 2,
  FAKE: 3,
} as const;

export const GPS_SBAS_MODE = {
  AUTO: 0,
  EGNOS: 1,
  WAAS: 2,
  MSAS: 3,
  GAGAN: 4,
  NONE: 5,
} as const;

/**
 * Deserialize MSP_GPS_CONFIG response
 */
export function deserializeGpsConfig(payload: Uint8Array): MSPGpsConfig {
  const reader = new PayloadReader(payload);

  return {
    provider: reader.readU8(),
    sbasMode: reader.readU8(),
    autoConfig: reader.readU8() === 1,
    autoBaud: reader.readU8() === 1,
    homePointOnce: reader.remaining() >= 1 ? reader.readU8() === 1 : false,
    ubloxUseGalileo: reader.remaining() >= 1 ? reader.readU8() === 1 : false,
  };
}

/**
 * Serialize MSP_SET_GPS_CONFIG payload
 */
export function serializeGpsConfig(config: MSPGpsConfig): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(config.provider);
  builder.writeU8(config.sbasMode);
  builder.writeU8(config.autoConfig ? 1 : 0);
  builder.writeU8(config.autoBaud ? 1 : 0);
  builder.writeU8(config.homePointOnce ? 1 : 0);
  builder.writeU8(config.ubloxUseGalileo ? 1 : 0);

  return builder.build();
}

// =============================================================================
// iNav Rate Profile (MSP2 0x2007 / 0x2008)
// =============================================================================

/**
 * iNav Rate Profile - used instead of RC_TUNING for iNav firmware
 * Note: iNav has RC_RATE fixed at 100, not settable!
 */
export interface MSPInavRateProfile {
  // Throttle settings
  throttleMid: number;        // 0-100 (percentage)
  throttleExpo: number;       // 0-100
  dynThrPID: number;          // Dynamic throttle PID
  tpaBreakpoint: number;      // TPA breakpoint (uint16)

  // Stabilized rates
  rcExpo: number;             // Roll/pitch expo 0-100
  rcYawExpo: number;          // Yaw expo 0-100
  rollRate: number;           // Roll rate in deg/s (stored as /10)
  pitchRate: number;          // Pitch rate in deg/s (stored as /10)
  yawRate: number;            // Yaw rate in deg/s (stored as /10)

  // Manual mode rates (optional, for airplane)
  manualRcExpo?: number;
  manualRcYawExpo?: number;
  manualRollRate?: number;
  manualPitchRate?: number;
  manualYawRate?: number;
}

/**
 * Deserialize MSPV2_INAV_RATE_PROFILE (0x2007) response
 */
export function deserializeInavRateProfile(payload: Uint8Array): MSPInavRateProfile {
  const reader = new PayloadReader(payload);

  // Throttle (5 bytes)
  const throttleMid = reader.readU8();
  const throttleExpo = reader.readU8();
  const dynThrPID = reader.readU8();
  const tpaBreakpoint = reader.readU16();

  // Stabilized (5 bytes)
  const rcExpo = reader.readU8();
  const rcYawExpo = reader.readU8();
  const rollRate = reader.readU8() * 10;  // Stored as /10
  const pitchRate = reader.readU8() * 10;
  const yawRate = reader.readU8() * 10;

  const profile: MSPInavRateProfile = {
    throttleMid,
    throttleExpo,
    dynThrPID,
    tpaBreakpoint,
    rcExpo,
    rcYawExpo,
    rollRate,
    pitchRate,
    yawRate,
  };

  // Manual mode (5 bytes) - optional, may not be present
  if (reader.remaining() >= 5) {
    profile.manualRcExpo = reader.readU8();
    profile.manualRcYawExpo = reader.readU8();
    profile.manualRollRate = reader.readU8();
    profile.manualPitchRate = reader.readU8();
    profile.manualYawRate = reader.readU8();
  }

  return profile;
}

/**
 * Serialize MSPV2_INAV_SET_RATE_PROFILE (0x2008) payload
 * This is what iNav configurator uses to save rates!
 */
export function serializeInavRateProfile(profile: MSPInavRateProfile): Uint8Array {
  const builder = new PayloadBuilder();

  // Throttle (5 bytes)
  builder.writeU8(profile.throttleMid);
  builder.writeU8(profile.throttleExpo);
  builder.writeU8(profile.dynThrPID);
  builder.writeU16(profile.tpaBreakpoint);

  // Stabilized (5 bytes) - rates stored as value/10
  builder.writeU8(profile.rcExpo);
  builder.writeU8(profile.rcYawExpo);
  builder.writeU8(Math.round(profile.rollRate / 10));
  builder.writeU8(Math.round(profile.pitchRate / 10));
  builder.writeU8(Math.round(profile.yawRate / 10));

  // Manual mode (5 bytes)
  builder.writeU8(profile.manualRcExpo ?? 0);
  builder.writeU8(profile.manualRcYawExpo ?? 0);
  builder.writeU8(profile.manualRollRate ?? 0);
  builder.writeU8(profile.manualPitchRate ?? 0);
  builder.writeU8(profile.manualYawRate ?? 0);

  return builder.build();
}

/**
 * Convert MSPRcTuning to MSPInavRateProfile for saving to iNav
 */
export function rcTuningToInavRateProfile(rcTuning: MSPRcTuning): MSPInavRateProfile {
  return {
    throttleMid: rcTuning.throttleMid,
    throttleExpo: rcTuning.throttleExpo,
    dynThrPID: rcTuning.dynThrPID,
    tpaBreakpoint: rcTuning.tpaBreakpoint,
    rcExpo: rcTuning.rcExpo,
    rcYawExpo: rcTuning.rcYawExpo,
    // Use rollPitchRate as fallback for old iNav compatibility
    rollRate: rcTuning.rollRate || rcTuning.rollPitchRate || 70,
    pitchRate: rcTuning.pitchRate || rcTuning.rollPitchRate || 70,
    yawRate: rcTuning.yawRate || 70,
    manualRcExpo: 0,
    manualRcYawExpo: 0,
    manualRollRate: 0,
    manualPitchRate: 0,
    manualYawRate: 0,
  };
}

/**
 * Convert MSPInavRateProfile to MSPRcTuning (for reading from iNav)
 * Used when reading rates via INAV_RATE_PROFILE (0x2007)
 */
export function inavRateProfileToRcTuning(profile: MSPInavRateProfile): MSPRcTuning {
  return {
    // iNav RC_RATE is fixed at 100
    rcRate: 100,
    rcExpo: profile.rcExpo,
    // For legacy compatibility, use rollRate for rollPitchRate
    rollPitchRate: profile.rollRate,
    yawRate: profile.yawRate,
    dynThrPID: profile.dynThrPID,
    throttleMid: profile.throttleMid,
    throttleExpo: profile.throttleExpo,
    tpaBreakpoint: profile.tpaBreakpoint,
    rcYawExpo: profile.rcYawExpo,
    // iNav doesn't have separate yaw/pitch rate tuning - use same values
    rcYawRate: 100,
    // iNav uses same rcExpo for both Roll AND Pitch (shared expo)
    rcPitchRate: 100,
    rcPitchExpo: profile.rcExpo, // Same as roll expo!
    rollRate: profile.rollRate,
    pitchRate: profile.pitchRate,
    yawRateLimit: 0,
    ratesType: 0,
  };
}
