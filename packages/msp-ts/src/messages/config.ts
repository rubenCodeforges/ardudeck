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

/**
 * iNav MSP2 PID coefficients with feedforward (FF)
 * Used by MSP2_INAV_PID (0x2030) / MSP2_INAV_SET_PID (0x2031)
 */
export interface MSPInavPidCoefficients {
  p: number;
  i: number;
  d: number;
  ff: number;  // Feedforward
}

/**
 * iNav MSP2 PID structure - ALL 11 PID controllers
 * Different from legacy MSP_PID - has feedforward and different layout
 *
 * iNav has 11 PID controllers, each with 4 bytes (P, I, D, FF):
 * 0: Roll, 1: Pitch, 2: Yaw, 3: Position Z, 4: Position XY,
 * 5: Velocity XY, 6: Surface, 7: Level, 8: Heading Hold,
 * 9: Velocity Z, 10: Nav Heading
 *
 * Total: 44 bytes (11 * 4)
 */
export interface MSPInavPid {
  roll: MSPInavPidCoefficients;        // Index 0
  pitch: MSPInavPidCoefficients;       // Index 1
  yaw: MSPInavPidCoefficients;         // Index 2
  posZ: MSPInavPidCoefficients;        // Index 3 - Position Z (altitude hold)
  posXY: MSPInavPidCoefficients;       // Index 4 - Position XY (position hold)
  velXY: MSPInavPidCoefficients;       // Index 5 - Velocity XY
  surface: MSPInavPidCoefficients;     // Index 6 - Surface (sonar altitude)
  level: MSPInavPidCoefficients;       // Index 7 - Level mode (angle/horizon)
  heading: MSPInavPidCoefficients;     // Index 8 - Heading Hold
  velZ: MSPInavPidCoefficients;        // Index 9 - Velocity Z (vertical speed)
  navHeading: MSPInavPidCoefficients;  // Index 10 - Nav Heading
}

export interface MSPRcTuning {
  rcRate: number;           // RC rate (0-255, represents 0.01-2.55)
  rcExpo: number;           // RC expo (0-100)
  rollPitchRate: number;    // Legacy: combined roll/pitch rate (= rollRate for compat)
  rollRate: number;         // Roll rate (BF byte 2)
  pitchRate: number;        // Pitch rate (BF byte 3)
  yawRate: number;          // Yaw rate (BF byte 4)
  dynThrPID: number;        // Dynamic throttle PID
  throttleMid: number;      // Throttle mid position
  throttleExpo: number;     // Throttle expo
  tpaBreakpoint: number;    // TPA breakpoint
  rcYawExpo: number;        // RC yaw expo
  rcYawRate: number;        // RC yaw rate
  rcPitchRate: number;      // RC pitch rate
  rcPitchExpo: number;      // RC pitch expo
  throttleLimitType: number;   // Throttle limit type (BF 4.x)
  throttleLimitPercent: number; // Throttle limit percent (BF 4.x)
  rollRateLimit: number;    // Roll rate limit (BF 4.x)
  pitchRateLimit: number;   // Pitch rate limit (BF 4.x)
  yawRateLimit: number;     // Yaw rate limit (BF 4.x)
  ratesType: number;        // Rates type (0=Betaflight, 1=Raceflight, 2=Kiss, 3=Actual, 4=Quick)
}

export interface MSPModeRange {
  boxId: number;        // Mode ID (see MSP_FLIGHT_MODE in constants)
  auxChannel: number;   // AUX channel (0=AUX1, 1=AUX2, etc.)
  rangeStart: number;   // Start of range (900-2100, in steps of 25)
  rangeEnd: number;     // End of range (900-2100, in steps of 25)
  modeLogic?: number;   // 0=OR (default), 1=AND — BF MODE_RANGES_EXTRA
  linkedTo?: number;    // Box ID to link to (0=none) — BF MODE_RANGES_EXTRA
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
 * Deserialize MSP_RC_TUNING response (Betaflight 4.x byte layout)
 *
 * BF wire format:
 * [0] rcRate, [1] rcExpo, [2] rollRate, [3] pitchRate, [4] yawRate,
 * [5] dynThrPID, [6] throttleMid, [7] throttleExpo, [8-9] tpaBreakpoint,
 * [10] rcYawExpo, [11] rcYawRate, [12] rcPitchRate, [13] rcPitchExpo,
 * [14] throttleLimitType, [15] throttleLimitPercent,
 * [16-17] rollRateLimit, [18-19] pitchRateLimit, [20-21] yawRateLimit,
 * [22] ratesType
 */
export function deserializeRcTuning(payload: Uint8Array): MSPRcTuning {
  const reader = new PayloadReader(payload);

  const rcRate = reader.readU8();          // 0
  const rcExpo = reader.readU8();          // 1
  const rollRate = reader.readU8();        // 2
  const pitchRate = reader.readU8();       // 3
  const yawRate = reader.readU8();         // 4
  const dynThrPID = reader.readU8();       // 5
  const throttleMid = reader.readU8();     // 6
  const throttleExpo = reader.readU8();    // 7
  const tpaBreakpoint = reader.remaining() >= 2 ? reader.readU16() : 1500; // 8-9
  const rcYawExpo = reader.remaining() >= 1 ? reader.readU8() : 0;         // 10
  const rcYawRate = reader.remaining() >= 1 ? reader.readU8() : 0;         // 11
  const rcPitchRate = reader.remaining() >= 1 ? reader.readU8() : 0;       // 12
  const rcPitchExpo = reader.remaining() >= 1 ? reader.readU8() : 0;       // 13
  const throttleLimitType = reader.remaining() >= 1 ? reader.readU8() : 0;        // 14
  const throttleLimitPercent = reader.remaining() >= 1 ? reader.readU8() : 100;   // 15
  const rollRateLimit = reader.remaining() >= 2 ? reader.readU16() : 1998;        // 16-17
  const pitchRateLimit = reader.remaining() >= 2 ? reader.readU16() : 1998;       // 18-19
  const yawRateLimit = reader.remaining() >= 2 ? reader.readU16() : 1998;         // 20-21
  const ratesType = reader.remaining() >= 1 ? reader.readU8() : 0;                // 22

  return {
    rcRate,
    rcExpo,
    rollPitchRate: rollRate, // Legacy compat: set to rollRate
    rollRate,
    pitchRate,
    yawRate,
    dynThrPID,
    throttleMid,
    throttleExpo,
    tpaBreakpoint,
    rcYawExpo,
    rcYawRate,
    rcPitchRate,
    rcPitchExpo,
    throttleLimitType,
    throttleLimitPercent,
    rollRateLimit,
    pitchRateLimit,
    yawRateLimit,
    ratesType,
  };
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
    rollRate,
    pitchRate,
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
    // Not applicable to iNav - safe defaults
    throttleLimitType: 0,
    throttleLimitPercent: 100,
    rollRateLimit: 1998,
    pitchRateLimit: 1998,
    yawRateLimit: 1998,
    ratesType: 0,
  };
}

/**
 * Serialize MSP_SET_RC_TUNING payload (Betaflight 4.x byte layout)
 *
 * Must match deserializeRcTuning byte order exactly.
 */
export function serializeRcTuning(rcTuning: MSPRcTuning): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(rcTuning.rcRate);                        // 0
  builder.writeU8(rcTuning.rcExpo);                        // 1
  builder.writeU8(rcTuning.rollRate);                      // 2
  builder.writeU8(rcTuning.pitchRate);                     // 3
  builder.writeU8(rcTuning.yawRate);                       // 4
  builder.writeU8(rcTuning.dynThrPID);                     // 5
  builder.writeU8(rcTuning.throttleMid);                   // 6
  builder.writeU8(rcTuning.throttleExpo);                  // 7
  builder.writeU16(rcTuning.tpaBreakpoint);                // 8-9
  builder.writeU8(rcTuning.rcYawExpo);                     // 10
  builder.writeU8(rcTuning.rcYawRate);                     // 11
  builder.writeU8(rcTuning.rcPitchRate);                   // 12
  builder.writeU8(rcTuning.rcPitchExpo);                   // 13
  builder.writeU8(rcTuning.throttleLimitType || 0);        // 14
  builder.writeU8(rcTuning.throttleLimitPercent || 100);   // 15
  builder.writeU16(rcTuning.rollRateLimit || 1998);        // 16-17
  builder.writeU16(rcTuning.pitchRateLimit || 1998);       // 18-19
  builder.writeU16(rcTuning.yawRateLimit || 1998);         // 20-21
  builder.writeU8(rcTuning.ratesType);                     // 22

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
  builder.writeU8(mode.modeLogic ?? 0);
  builder.writeU8(mode.linkedTo ?? 0);

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

// iNav permanent box IDs (from fc_msp_box.c)
export const MODE_NAMES: Record<number, string> = {
  0: 'ARM',
  1: 'ANGLE',
  2: 'HORIZON',
  3: 'NAV ALTHOLD',
  5: 'HEADING HOLD',
  6: 'HEADFREE',
  7: 'HEADADJ',
  8: 'CAMSTAB',
  10: 'NAV RTH',
  11: 'NAV POSHOLD',
  12: 'MANUAL',
  13: 'BEEPER',
  15: 'LEDS OFF',
  16: 'LIGHTS',
  19: 'OSD OFF',
  20: 'TELEMETRY',
  21: 'AUTO TUNE',
  26: 'BLACKBOX',
  27: 'FAILSAFE',
  28: 'NAV WP',
  29: 'AIR MODE',
  30: 'HOME RESET',
  31: 'GCS NAV',
  32: 'FPV ANGLE MIX',
  33: 'SURFACE',
  34: 'FLAPERON',
  35: 'TURN ASSIST',
  36: 'NAV LAUNCH',
  37: 'SERVO AUTOTRIM',
  39: 'CAMERA 1',
  40: 'CAMERA 2',
  41: 'CAMERA 3',
  42: 'OSD ALT 1',
  43: 'OSD ALT 2',
  44: 'OSD ALT 3',
  45: 'NAV CRUISE',
  46: 'MC BRAKING',
  47: 'USER1',
  48: 'USER2',
  49: 'LOITER CHANGE',
  50: 'MSP RC OVERRIDE',
  51: 'PREARM',
  52: 'TURTLE',
  53: 'NAV COURSE HOLD',
  54: 'AUTO LEVEL',
  55: 'WP PLANNER',
  56: 'SOARING',
  57: 'USER3',
  58: 'USER4',
  59: 'MISSION CHANGE',
  60: 'BEEPER MUTE',
  61: 'MULTI FUNC',
  62: 'MIXER PROFILE 2',
  63: 'MIXER TRANSITION',
  64: 'ANGLE HOLD',
  65: 'GIMBAL TILT',
  66: 'GIMBAL ROLL',
  67: 'GIMBAL CENTER',
  68: 'GIMBAL HEADTRACKER',
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
  rate: number;             // Mix rate as S16 (-2000 to +2000, typically -500 to +500)
  speed: number;            // Speed limiting (0 = none, 1-255 = slower)
  min: number;              // CLI ONLY - Not in MSP protocol, kept for CLI fallback
  max: number;              // CLI ONLY - Not in MSP protocol, kept for CLI fallback
  box: number;              // Condition ID / box (-1 = always active)
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
  // iNav: 7 bytes per servo (min, max, mid, rate)
  // Betaflight: 12 bytes per servo (min, max, mid, rate, forward, reversed)
  // Legacy: 14 bytes per servo (min, max, mid, rate, 2 padding, forward, reversed)
  // Check % 7 first: 84 bytes (12 servos × 7) is also divisible by 12, so iNav must win
  const bytesPerServo = payload.length % 7 === 0 ? 7 : (payload.length % 12 === 0 ? 12 : 14);

  console.log(`[MSP] Servo format detection: ${payload.length} bytes, using ${bytesPerServo}-byte format`);

  if (bytesPerServo === 7) {
    // iNav format: 7 bytes per servo
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
  } else if (bytesPerServo === 12) {
    // Betaflight format: 12 bytes per servo (no padding)
    while (reader.remaining() >= 12) {
      const min = reader.readU16();
      const max = reader.readU16();
      const middle = reader.readU16();
      const rate = reader.readS8();
      const forwardFromChannel = reader.readU8();
      const reversedSources = reader.readU32();
      servos.push({ min, max, middle, rate, forwardFromChannel, reversedSources });
    }
  } else {
    // Legacy 14-byte format: 14 bytes per servo (with 2 padding bytes)
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
 *
 * iNav format (6 bytes per rule):
 *   - targetChannel: U8
 *   - inputSource: U8
 *   - rate: S16 (little-endian) - range -2000 to +2000, but typically -500 to +500
 *   - speed: U8
 *   - conditionId: S8 (box/condition, -1 = always active)
 */
export function deserializeServoMixerRules(payload: Uint8Array): MSPServoMixerRule[] {
  const reader = new PayloadReader(payload);
  const rules: MSPServoMixerRule[] = [];

  // Each rule is 6 bytes in iNav (NOT 7!)
  while (reader.remaining() >= 6) {
    rules.push({
      targetChannel: reader.readU8(),
      inputSource: reader.readU8(),
      rate: reader.readS16(), // S16, not S8!
      speed: reader.readU8(),
      min: 0,  // Not in MSP, kept for CLI compatibility
      max: 0,  // Not in MSP, kept for CLI compatibility
      box: reader.readS8(),
    });
  }

  return rules;
}

/**
 * Serialize a single iNav servo mixer rule
 *
 * iNav SET format (7 bytes):
 *   - index: U8 (rule index)
 *   - targetChannel: U8
 *   - inputSource: U8
 *   - rate: S16 (little-endian)
 *   - speed: U8
 *   - conditionId: S8 (box/condition, -1 = always active)
 */
export function serializeServoMixerRule(index: number, rule: MSPServoMixerRule): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(index);
  builder.writeU8(rule.targetChannel);
  builder.writeU8(rule.inputSource);
  builder.writeS16(rule.rate);  // S16, not S8!
  builder.writeU8(rule.speed);
  builder.writeS8(rule.box);    // conditionId/box, NOT min/max

  return builder.build();
}

// =============================================================================
// Motor Mixer Configuration
// =============================================================================

export interface MSPMotorMixerRule {
  throttle: number;  // -2.0 to 2.0 (stored as (value+2)*1000 in MSP, so 0-4000)
  roll: number;      // -2.0 to 2.0
  pitch: number;     // -2.0 to 2.0
  yaw: number;       // -2.0 to 2.0
}

/**
 * Deserialize MSP2_COMMON_MOTOR_MIXER response
 *
 * iNav encoding: Each motor rule is 8 bytes (4 × uint16)
 * Values use +2 offset then *1000: mspValue = (value + 2) * 1000
 * So value = (mspValue / 1000) - 2
 *
 * Examples:
 *   throttle=1.0  → MSP=3000
 *   roll=-1.0     → MSP=1000
 *   roll=1.0      → MSP=3000
 */
export function deserializeMotorMixerRules(payload: Uint8Array): MSPMotorMixerRule[] {
  const reader = new PayloadReader(payload);
  const rules: MSPMotorMixerRule[] = [];

  // Maximum reasonable number of motors (prevents garbage data issues)
  const MAX_MOTORS = 12;

  // Each motor rule is 8 bytes (4 × uint16)
  while (reader.remaining() >= 8 && rules.length < MAX_MOTORS) {
    // iNav encoding: (value + 2) * 1000, so we reverse it
    const throttle = reader.readU16() / 1000 - 2;
    const roll = reader.readU16() / 1000 - 2;
    const pitch = reader.readU16() / 1000 - 2;
    const yaw = reader.readU16() / 1000 - 2;

    // Validate entry - real motors must have:
    // 1. Positive throttle (motors need throttle > 0)
    // 2. Values within valid range (-2.0 to 2.0)
    const isValidThrottle = throttle > 0 && throttle <= 2.0;
    const isValidRange = Math.abs(roll) <= 2.0 && Math.abs(pitch) <= 2.0 && Math.abs(yaw) <= 2.0;

    if (isValidThrottle && isValidRange) {
      rules.push({ throttle, roll, pitch, yaw });
    }
  }

  return rules;
}

/**
 * Serialize a single motor mixer rule for MSP2_COMMON_SET_MOTOR_MIXER
 *
 * iNav encoding: mspValue = (value + 2) * 1000
 * Format: index(u8), throttle(u16), roll(u16), pitch(u16), yaw(u16) = 9 bytes
 *
 * Examples:
 *   throttle=1.0  → MSP=3000
 *   roll=-1.0     → MSP=1000
 *   roll=1.0      → MSP=3000
 */
export function serializeMotorMixerRule(index: number, rule: MSPMotorMixerRule): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(index);
  // iNav encoding: (value + 2) * 1000
  builder.writeU16(Math.round((rule.throttle + 2) * 1000));
  builder.writeU16(Math.round((rule.roll + 2) * 1000));
  builder.writeU16(Math.round((rule.pitch + 2) * 1000));
  builder.writeU16(Math.round((rule.yaw + 2) * 1000));

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
    rollRate: profile.rollRate,
    pitchRate: profile.pitchRate,
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
    // Not applicable to iNav - safe defaults
    throttleLimitType: 0,
    throttleLimitPercent: 100,
    rollRateLimit: 1998,
    pitchRateLimit: 1998,
    yawRateLimit: 1998,
    ratesType: 0,
  };
}

// =============================================================================
// iNav MSP2 PID (0x2030 / 0x2031)
// =============================================================================

/**
 * Deserialize MSP2_INAV_PID (0x2030) response
 *
 * iNav uses 4 bytes per PID controller (P, I, D, FF).
 * Total: 11 controllers * 4 bytes = 44 bytes
 *
 * Order: Roll, Pitch, Yaw, PosZ, PosXY, VelXY, Surface, Level, Heading, VelZ, NavHeading
 */
export function deserializeInavPid(payload: Uint8Array): MSPInavPid {
  const reader = new PayloadReader(payload);

  // Read 4-byte PID blocks (P, I, D, FF)
  const readPid4 = (): MSPInavPidCoefficients => ({
    p: reader.readU8(),
    i: reader.readU8(),
    d: reader.readU8(),
    ff: reader.readU8(),
  });

  // Default coefficients for missing controllers
  const defaultPid = (): MSPInavPidCoefficients => ({ p: 0, i: 0, d: 0, ff: 0 });

  const pid: MSPInavPid = {
    roll: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    pitch: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    yaw: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    posZ: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    posXY: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    velXY: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    surface: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    level: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    heading: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    velZ: reader.remaining() >= 4 ? readPid4() : defaultPid(),
    navHeading: reader.remaining() >= 4 ? readPid4() : defaultPid(),
  };

  return pid;
}

/**
 * Serialize MSP2_INAV_SET_PID (0x2031) payload
 *
 * MUST send all 11 PID controllers (44 bytes total)!
 * Sending fewer bytes causes iNav to reject the command as "not supported".
 */
export function serializeInavPid(pid: MSPInavPid): Uint8Array {
  const builder = new PayloadBuilder();

  const writePid4 = (p: MSPInavPidCoefficients) => {
    builder.writeU8(p.p);
    builder.writeU8(p.i);
    builder.writeU8(p.d);
    builder.writeU8(p.ff);
  };

  // Default PID values for controllers we don't care about
  const defaultPid: MSPInavPidCoefficients = { p: 0, i: 0, d: 0, ff: 0 };

  // Write ALL 11 controllers in exact order (44 bytes total)
  writePid4(pid.roll);                       // Index 0
  writePid4(pid.pitch);                      // Index 1
  writePid4(pid.yaw);                        // Index 2
  writePid4(pid.posZ ?? defaultPid);         // Index 3 - Position Z
  writePid4(pid.posXY ?? defaultPid);        // Index 4 - Position XY
  writePid4(pid.velXY ?? defaultPid);        // Index 5 - Velocity XY
  writePid4(pid.surface ?? defaultPid);      // Index 6 - Surface
  writePid4(pid.level ?? defaultPid);        // Index 7 - Level
  writePid4(pid.heading ?? defaultPid);      // Index 8 - Heading Hold
  writePid4(pid.velZ ?? defaultPid);         // Index 9 - Velocity Z
  writePid4(pid.navHeading ?? defaultPid);   // Index 10 - Nav Heading

  return builder.build();
}

/**
 * Convert legacy MSPPid to iNav MSP2 format (MSPInavPid)
 * Sets FF to 0 since legacy format doesn't have it.
 *
 * IMPORTANT: This creates a partial MSPInavPid - caller MUST merge with
 * current FC state to preserve nav/position PIDs before sending!
 */
export function pidToInavPid(pid: MSPPid): Partial<MSPInavPid> {
  const toInav = (p: MSPPidCoefficients): MSPInavPidCoefficients => ({
    p: p.p,
    i: p.i,
    d: p.d,
    ff: 0, // Legacy format doesn't have FF
  });

  const toInav4 = (p?: MSPPidCoefficients): MSPInavPidCoefficients | undefined =>
    p ? { p: p.p, i: p.i, d: p.d, ff: 0 } : undefined;

  // Only return the flight PIDs that the user controls
  // Other PIDs (posZ, posXY, velXY, etc.) should be preserved from FC state
  return {
    roll: toInav(pid.roll),
    pitch: toInav(pid.pitch),
    yaw: toInav(pid.yaw),
    level: toInav4(pid.level),
  };
}

/**
 * Convert iNav MSP2 PID format to legacy MSPPid
 * Drops the FF value since legacy format doesn't support it
 */
export function inavPidToPid(inavPid: MSPInavPid): MSPPid {
  const toLegacy = (p: MSPInavPidCoefficients): MSPPidCoefficients => ({
    p: p.p,
    i: p.i,
    d: p.d,
  });

  return {
    roll: toLegacy(inavPid.roll),
    pitch: toLegacy(inavPid.pitch),
    yaw: toLegacy(inavPid.yaw),
    level: toLegacy(inavPid.level),
  };
}

/**
 * Merge partial PID updates into full iNav PID structure
 * Used when modifying only roll/pitch/yaw/level but need to send all 44 bytes
 */
export function mergeInavPid(current: MSPInavPid, updates: Partial<MSPInavPid>): MSPInavPid {
  return {
    roll: updates.roll ?? current.roll,
    pitch: updates.pitch ?? current.pitch,
    yaw: updates.yaw ?? current.yaw,
    posZ: updates.posZ ?? current.posZ,
    posXY: updates.posXY ?? current.posXY,
    velXY: updates.velXY ?? current.velXY,
    surface: updates.surface ?? current.surface,
    level: updates.level ?? current.level,
    heading: updates.heading ?? current.heading,
    velZ: updates.velZ ?? current.velZ,
    navHeading: updates.navHeading ?? current.navHeading,
  };
}

// =============================================================================
// iNav Waypoint/Mission Support (MSP_WP / MSP_SET_WP)
// =============================================================================

/**
 * iNav Waypoint Action Types
 * Used for navigation mission planning
 */
export const MSP_WP_ACTION = {
  WAYPOINT: 1,        // Navigate to position
  POSHOLD_UNLIM: 2,   // Hold position indefinitely (not supported)
  POSHOLD_TIME: 3,    // Hold position for time (p1 = seconds)
  RTH: 4,             // Return to home (p1 = land flag)
  SET_POI: 5,         // Set point of interest
  JUMP: 6,            // Jump to waypoint (p1 = target wp#, p2 = repeat count)
  SET_HEAD: 7,        // Set heading (p1 = heading degrees)
  LAND: 8,            // Land at position
} as const;

/**
 * Waypoint flag values
 */
export const MSP_WP_FLAG = {
  NORMAL: 0x00,       // Standard waypoint
  LAST: 0xa5,         // Last waypoint in mission (165)
  FLY_BY_HOME: 0x48,  // Fly-by-home active
} as const;

/**
 * iNav Waypoint structure
 * Matches the MSP_WP / MSP_SET_WP 21-byte payload
 */
export interface MSPWaypoint {
  wpNo: number;       // Waypoint number (0-59, 0=home, 255=poshold)
  action: number;     // Action type (see MSP_WP_ACTION)
  lat: number;        // Latitude in degrees (stored as *1e7 in MSP)
  lon: number;        // Longitude in degrees (stored as *1e7 in MSP)
  altitude: number;   // Altitude in meters (stored as cm in MSP)
  p1: number;         // Param 1 (speed cm/s for WAYPOINT, land flag for RTH)
  p2: number;         // Param 2 (varies by action)
  p3: number;         // Param 3 / bitfield
  flag: number;       // 0x00=normal, 0xa5=last, 0x48=fly-by-home
}

/**
 * iNav Mission Info from MSP_WP_GETINFO
 */
export interface MSPMissionInfo {
  reserved: number;           // Reserved byte
  navVersion: number;         // Navigation version
  waypointCount: number;      // Number of waypoints in mission
  isValid: boolean;           // Mission is valid
  waypointListMaximum: number; // Maximum waypoints supported
}

/**
 * Deserialize MSP_WP response (single waypoint)
 * Response is 21 bytes for a single waypoint
 */
export function deserializeWaypoint(payload: Uint8Array): MSPWaypoint {
  const reader = new PayloadReader(payload);

  return {
    wpNo: reader.readU8(),
    action: reader.readU8(),
    lat: reader.readS32() / 1e7,        // Convert from *1e7 to degrees
    lon: reader.readS32() / 1e7,        // Convert from *1e7 to degrees
    altitude: reader.readS32() / 100,   // Convert from cm to meters
    p1: reader.readS16(),
    p2: reader.readS16(),
    p3: reader.readS16(),
    flag: reader.readU8(),
  };
}

/**
 * Serialize MSP_SET_WP payload (single waypoint)
 * Payload is 21 bytes
 */
export function serializeWaypoint(wp: MSPWaypoint): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(wp.wpNo);
  builder.writeU8(wp.action);
  builder.writeS32(Math.round(wp.lat * 1e7));    // Convert degrees to *1e7
  builder.writeS32(Math.round(wp.lon * 1e7));    // Convert degrees to *1e7
  builder.writeS32(Math.round(wp.altitude * 100)); // Convert meters to cm
  builder.writeS16(wp.p1);
  builder.writeS16(wp.p2);
  builder.writeS16(wp.p3);
  builder.writeU8(wp.flag);

  return builder.build();
}

/**
 * Deserialize MSP_WP_GETINFO response
 * Returns mission metadata
 *
 * Byte order (from iNav configurator MSPHelper.js):
 * - Byte 0: Reserved (waypoint capabilities)
 * - Byte 1: Max waypoints supported
 * - Byte 2: Valid mission flag (1 = valid)
 * - Byte 3: Count of busy points (actual waypoint count!)
 */
export function deserializeMissionInfo(payload: Uint8Array): MSPMissionInfo {
  const reader = new PayloadReader(payload);

  return {
    reserved: reader.readU8(),                    // Byte 0
    waypointListMaximum: reader.readU8(),         // Byte 1 - max waypoints
    isValid: reader.readU8() === 1,               // Byte 2 - valid mission flag
    waypointCount: reader.readU8(),               // Byte 3 - actual waypoint count
    navVersion: 0,                                // Not in this response
  };
}

// =============================================================================
// Failsafe Config (MSP_FAILSAFE_CONFIG / MSP_SET_FAILSAFE_CONFIG)
// =============================================================================

/**
 * Failsafe configuration from MSP_FAILSAFE_CONFIG (75)
 *
 * Failsafe procedure values:
 * - 0: LAND - Land in place
 * - 1: DROP - Cut motors immediately
 * - 2: RTH - Return to home
 * - 3: NONE - Do nothing
 */
export interface MSPFailsafeConfig {
  failsafeDelay: number;              // Delay before activating failsafe (0.1s units)
  failsafeOffDelay: number;           // Delay before deactivating failsafe after recovery (0.1s units)
  failsafeThrottle: number;           // Throttle value during failsafe (1000-2000)
  failsafeKillSwitch: number;         // Kill switch mode (0=off, 1=on)
  failsafeThrottleLowDelay: number;   // Delay for low throttle failsafe (0.1s units)
  failsafeProcedure: number;          // Failsafe procedure (0=LAND, 1=DROP, 2=RTH, 3=NONE)
  failsafeRecoveryDelay: number;      // Recovery delay (0.1s units)
  failsafeFwRollAngle: number;        // Fixed-wing roll angle during failsafe (0.1 deg)
  failsafeFwPitchAngle: number;       // Fixed-wing pitch angle during failsafe (0.1 deg)
  failsafeFwYawRate: number;          // Fixed-wing yaw rate during failsafe (deg/s)
  failsafeStickMotionThreshold: number; // Stick motion threshold to cancel failsafe
  failsafeMinDistance: number;        // Minimum distance for RTH failsafe (meters)
  failsafeMinDistanceProcedure: number; // Procedure when under min distance (0=LAND, 1=DROP, 2=RTH, 3=NONE)
}

/**
 * Deserialize MSP_FAILSAFE_CONFIG response (20 bytes)
 *
 * Byte layout (from iNav Configurator MSPHelper.js):
 * - Byte 0: failsafe_delay (U8)
 * - Byte 1: failsafe_off_delay (U8)
 * - Bytes 2-3: failsafe_throttle (U16 LE)
 * - Byte 4: failsafe_kill_switch (U8)
 * - Bytes 5-6: failsafe_throttle_low_delay (U16 LE)
 * - Byte 7: failsafe_procedure (U8)
 * - Byte 8: failsafe_recovery_delay (U8)
 * - Bytes 9-10: failsafe_fw_roll_angle (U16 LE)
 * - Bytes 11-12: failsafe_fw_pitch_angle (U16 LE)
 * - Bytes 13-14: failsafe_fw_yaw_rate (U16 LE)
 * - Bytes 15-16: failsafe_stick_motion_threshold (U16 LE)
 * - Bytes 17-18: failsafe_min_distance (U16 LE)
 * - Byte 19: failsafe_min_distance_procedure (U8)
 */
export function deserializeFailsafeConfig(payload: Uint8Array): MSPFailsafeConfig {
  const reader = new PayloadReader(payload);

  return {
    // First 8 bytes — shared BF/iNav
    failsafeDelay: reader.readU8(),
    failsafeOffDelay: reader.readU8(),
    failsafeThrottle: reader.readU16(),
    failsafeKillSwitch: reader.readU8(),
    failsafeThrottleLowDelay: reader.readU16(),
    failsafeProcedure: reader.readU8(),
    // Bytes 8-19 — iNav only (BF sends only 8 bytes)
    failsafeRecoveryDelay: reader.remaining() >= 1 ? reader.readU8() : 0,
    failsafeFwRollAngle: reader.remaining() >= 2 ? reader.readS16() : 0,
    failsafeFwPitchAngle: reader.remaining() >= 2 ? reader.readS16() : 0,
    failsafeFwYawRate: reader.remaining() >= 2 ? reader.readS16() : 0,
    failsafeStickMotionThreshold: reader.remaining() >= 2 ? reader.readU16() : 50,
    failsafeMinDistance: reader.remaining() >= 2 ? reader.readU16() : 0,
    failsafeMinDistanceProcedure: reader.remaining() >= 1 ? reader.readU8() : 0,
  };
}

/**
 * Serialize MSP_SET_FAILSAFE_CONFIG payload (20 bytes)
 */
export function serializeFailsafeConfig(config: MSPFailsafeConfig): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU8(config.failsafeDelay);
  builder.writeU8(config.failsafeOffDelay);
  builder.writeU16(config.failsafeThrottle);
  builder.writeU8(config.failsafeKillSwitch);
  builder.writeU16(config.failsafeThrottleLowDelay);
  builder.writeU8(config.failsafeProcedure);
  builder.writeU8(config.failsafeRecoveryDelay);
  // Fixed-wing angles and rates are signed (can be negative)
  builder.writeS16(config.failsafeFwRollAngle);
  builder.writeS16(config.failsafeFwPitchAngle);
  builder.writeS16(config.failsafeFwYawRate);
  builder.writeU16(config.failsafeStickMotionThreshold);
  builder.writeU16(config.failsafeMinDistance);
  builder.writeU8(config.failsafeMinDistanceProcedure);

  return builder.build();
}

// =============================================================================
// Betaflight GPS Rescue Configuration (MSP_GPS_RESCUE / MSP_SET_GPS_RESCUE)
// =============================================================================

/**
 * Betaflight GPS Rescue configuration
 * MSP command 135 (read) / 225 (write)
 *
 * GPS Rescue is Betaflight's RTH (Return to Home) feature.
 * When activated, the quad will climb to altitude and fly back to home.
 */
export interface MSPGpsRescueConfig {
  // Angle settings (in decidegrees, /10 for degrees)
  angle: number;                   // Max tilt angle during rescue (decidegrees)
  initialAltitudeM: number;        // Rescue altitude (meters)
  descentDistanceM: number;        // Start descent at this distance from home (meters)
  rescueGroundspeed: number;       // Return speed (cm/s)
  throttleMin: number;             // Minimum throttle (1000-2000)
  throttleMax: number;             // Maximum throttle (1000-2000)
  throttleHover: number;           // Hover throttle (1000-2000)
  sanityChecks: number;            // Sanity check flags
  minSats: number;                 // Minimum satellites required
  // Ascend/descend rates (cm/s)
  ascendRate: number;              // Climb rate (cm/s)
  descendRate: number;             // Descent rate (cm/s)
  allowArmingWithoutFix: number;   // Allow arming without GPS fix (0/1)
  altitudeMode: number;            // 0=MAX_ALT, 1=FIXED_ALT, 2=CURRENT_ALT
  // Version 2+ fields (Betaflight 4.3+)
  minRescueDth: number;            // Minimum distance to activate (meters)
  targetLandingAltitudeM: number;  // Landing altitude (meters)
}

/**
 * Betaflight GPS Rescue PIDs
 * MSP command 136 (read) / 226 (write)
 */
export interface MSPGpsRescuePids {
  throttleP: number;
  throttleI: number;
  throttleD: number;
  velP: number;
  velI: number;
  velD: number;
  yawP: number;
}

// GPS Rescue altitude modes
export const GPS_RESCUE_ALTITUDE_MODE = {
  MAX_ALT: 0,     // Use maximum of current and rescue altitude
  FIXED_ALT: 1,   // Always use rescue altitude
  CURRENT_ALT: 2, // Use current altitude
} as const;

// GPS Rescue sanity check flags
export const GPS_RESCUE_SANITY_CHECKS = {
  NONE: 0,
  FLYAWAY: 1,
  ALL: 2,
} as const;

/**
 * Deserialize MSP_GPS_RESCUE response
 */
export function deserializeGpsRescueConfig(payload: Uint8Array): MSPGpsRescueConfig {
  const reader = new PayloadReader(payload);

  const config: MSPGpsRescueConfig = {
    angle: reader.readU16(),
    initialAltitudeM: reader.readU16(),
    descentDistanceM: reader.readU16(),
    rescueGroundspeed: reader.readU16(),
    throttleMin: reader.readU16(),
    throttleMax: reader.readU16(),
    throttleHover: reader.readU16(),
    sanityChecks: reader.readU8(),
    minSats: reader.readU8(),
    ascendRate: reader.readU16(),
    descendRate: reader.readU16(),
    allowArmingWithoutFix: reader.readU8(),
    altitudeMode: reader.readU8(),
    minRescueDth: reader.remaining() >= 2 ? reader.readU16() : 30,
    targetLandingAltitudeM: reader.remaining() >= 2 ? reader.readU16() : 5,
  };

  return config;
}

/**
 * Serialize MSP_SET_GPS_RESCUE payload
 */
export function serializeGpsRescueConfig(config: MSPGpsRescueConfig): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU16(config.angle);
  builder.writeU16(config.initialAltitudeM);
  builder.writeU16(config.descentDistanceM);
  builder.writeU16(config.rescueGroundspeed);
  builder.writeU16(config.throttleMin);
  builder.writeU16(config.throttleMax);
  builder.writeU16(config.throttleHover);
  builder.writeU8(config.sanityChecks);
  builder.writeU8(config.minSats);
  builder.writeU16(config.ascendRate);
  builder.writeU16(config.descendRate);
  builder.writeU8(config.allowArmingWithoutFix);
  builder.writeU8(config.altitudeMode);
  builder.writeU16(config.minRescueDth);
  builder.writeU16(config.targetLandingAltitudeM);

  return builder.build();
}

/**
 * Deserialize MSP_GPS_RESCUE_PIDS response
 */
export function deserializeGpsRescuePids(payload: Uint8Array): MSPGpsRescuePids {
  const reader = new PayloadReader(payload);

  return {
    throttleP: reader.readU16(),
    throttleI: reader.readU16(),
    throttleD: reader.readU16(),
    velP: reader.readU16(),
    velI: reader.readU16(),
    velD: reader.readU16(),
    yawP: reader.readU16(),
  };
}

/**
 * Serialize MSP_SET_GPS_RESCUE_PIDS payload
 */
export function serializeGpsRescuePids(pids: MSPGpsRescuePids): Uint8Array {
  const builder = new PayloadBuilder();

  builder.writeU16(pids.throttleP);
  builder.writeU16(pids.throttleI);
  builder.writeU16(pids.throttleD);
  builder.writeU16(pids.velP);
  builder.writeU16(pids.velI);
  builder.writeU16(pids.velD);
  builder.writeU16(pids.yawP);

  return builder.build();
}

// =============================================================================
// Betaflight Filter Configuration (MSP_FILTER_CONFIG / MSP_SET_FILTER_CONFIG)
// =============================================================================

/**
 * Betaflight Filter Configuration
 * MSP command 92 (read) / 93 (write)
 */
export interface MSPFilterConfig {
  // Gyro lowpass filters
  gyroLowpassHz: number;           // Gyro lowpass 1 cutoff (U16 from byte 20-21, overwrites byte 0)
  dTermLowpassHz: number;          // D-term lowpass 1 cutoff
  yawLowpassHz: number;            // Yaw lowpass cutoff
  // Gyro notch filter
  gyroNotchHz: number;             // Gyro notch center freq
  gyroNotchCutoff: number;         // Gyro notch cutoff
  // D-term notch filter
  dTermNotchHz: number;            // D-term notch center freq
  dTermNotchCutoff: number;        // D-term notch cutoff
  // Second gyro notch (Betaflight 3.4+)
  gyroNotch2Hz: number;            // Second gyro notch center
  gyroNotch2Cutoff: number;        // Second gyro notch cutoff
  // Filter types (Betaflight 4.0+)
  dTermLowpassType: number;        // D-term lowpass type (byte 17)
  gyroHardwareLpf: number;         // Gyro hardware LPF (byte 18)
  gyroLowpassType: number;         // 0=PT1, 1=BIQUAD, 2=PT2, 3=PT3 (byte 24)
  gyroLowpass2Hz: number;          // Second gyro lowpass cutoff
  gyroLowpass2Type: number;        // Second gyro lowpass type
  dTermLowpass2Hz: number;         // Second D-term lowpass cutoff
  dTermLowpass2Type: number;       // Second D-term lowpass type
  // Dynamic lowpass (Betaflight 4.1+)
  gyroLowpassDynMinHz: number;     // Gyro dynamic lowpass min freq
  gyroLowpassDynMaxHz: number;     // Gyro dynamic lowpass max freq
  dTermLowpassDynMinHz: number;    // D-term dynamic lowpass min freq
  dTermLowpassDynMaxHz: number;    // D-term dynamic lowpass max freq
  // Dynamic notch (Betaflight 4.1+)
  dynNotchRange: number;           // Dynamic notch range
  dynNotchWidthPercent: number;    // Dynamic notch width percent
  dynNotchQ: number;               // Dynamic notch Q factor
  dynNotchMinHz: number;           // Dynamic notch minimum freq
  // RPM notch filter
  gyroRpmNotchHarmonics: number;   // RPM notch harmonics count
  gyroRpmNotchMinHz: number;       // RPM notch minimum freq
  dynNotchMaxHz: number;           // Dynamic notch maximum freq
  dynLpfCurveExpo: number;         // Dynamic LPF curve expo
  dynNotchCount: number;           // Number of dynamic notches
}

// Filter types
export const FILTER_TYPE = {
  PT1: 0,
  BIQUAD: 1,
  PT2: 2,
  PT3: 3,
} as const;

/**
 * Deserialize MSP_FILTER_CONFIG response (Betaflight 4.x byte layout)
 *
 * BF wire format:
 * [0] gyroLowpassHz(U8), [1-2] dTermLowpassHz(U16), [3-4] yawLowpassHz(U16),
 * [5-6] gyroNotchHz(U16), [7-8] gyroNotchCutoff(U16),
 * [9-10] dTermNotchHz(U16), [11-12] dTermNotchCutoff(U16),
 * [13-14] gyroNotch2Hz(U16), [15-16] gyroNotch2Cutoff(U16),
 * [17] dTermLowpassType(U8), [18] gyroHardwareLpf(U8), [19] skip(U8),
 * [20-21] gyroLowpassHz(U16, overwrites byte 0), [22-23] gyroLowpass2Hz(U16),
 * [24] gyroLowpassType(U8), [25] gyroLowpass2Type(U8),
 * [26-27] dTermLowpass2Hz(U16), [28] dTermLowpass2Type(U8),
 * [29-30] gyroLowpassDynMinHz(U16), [31-32] gyroLowpassDynMaxHz(U16),
 * [33-34] dTermLowpassDynMinHz(U16), [35-36] dTermLowpassDynMaxHz(U16),
 * [37] dynNotchRange(U8), [38] dynNotchWidthPercent(U8),
 * [39-40] dynNotchQ(U16), [41-42] dynNotchMinHz(U16),
 * [43] gyroRpmNotchHarmonics(U8), [44] gyroRpmNotchMinHz(U8),
 * [45-46] dynNotchMaxHz(U16), [47] dynLpfCurveExpo(U8), [48] dynNotchCount(U8)
 */
export function deserializeFilterConfig(payload: Uint8Array): MSPFilterConfig {
  const reader = new PayloadReader(payload);

  // Bytes 0-16: core filter settings (always present)
  let gyroLowpassHz: number = reader.readU8();       // 0 (initial U8, may be overwritten)
  const dTermLowpassHz = reader.readU16();            // 1-2
  const yawLowpassHz = reader.readU16();              // 3-4
  const gyroNotchHz = reader.readU16();               // 5-6
  const gyroNotchCutoff = reader.readU16();           // 7-8
  const dTermNotchHz = reader.readU16();              // 9-10
  const dTermNotchCutoff = reader.readU16();          // 11-12
  const gyroNotch2Hz = reader.readU16();              // 13-14
  const gyroNotch2Cutoff = reader.readU16();          // 15-16

  // Byte 17+: extended fields (BF 4.0+)
  const dTermLowpassType = reader.remaining() >= 1 ? reader.readU8() : 0;       // 17
  const gyroHardwareLpf = reader.remaining() >= 1 ? reader.readU8() : 0;        // 18
  if (reader.remaining() >= 1) reader.readU8(); // 19: skip unused byte (gyro_32khz_hardware_lpf)

  // Bytes 20-21: U16 gyroLowpassHz overwrites the U8 from byte 0
  if (reader.remaining() >= 2) gyroLowpassHz = reader.readU16();                // 20-21
  const gyroLowpass2Hz = reader.remaining() >= 2 ? reader.readU16() : 0;        // 22-23
  const gyroLowpassType = reader.remaining() >= 1 ? reader.readU8() : 0;        // 24
  const gyroLowpass2Type = reader.remaining() >= 1 ? reader.readU8() : 0;       // 25
  const dTermLowpass2Hz = reader.remaining() >= 2 ? reader.readU16() : 0;       // 26-27
  const dTermLowpass2Type = reader.remaining() >= 1 ? reader.readU8() : 0;      // 28

  // Dynamic lowpass (BF 4.1+)
  const gyroLowpassDynMinHz = reader.remaining() >= 2 ? reader.readU16() : 0;   // 29-30
  const gyroLowpassDynMaxHz = reader.remaining() >= 2 ? reader.readU16() : 0;   // 31-32
  const dTermLowpassDynMinHz = reader.remaining() >= 2 ? reader.readU16() : 0;  // 33-34
  const dTermLowpassDynMaxHz = reader.remaining() >= 2 ? reader.readU16() : 0;  // 35-36

  // Dynamic notch
  const dynNotchRange = reader.remaining() >= 1 ? reader.readU8() : 0;          // 37
  const dynNotchWidthPercent = reader.remaining() >= 1 ? reader.readU8() : 0;   // 38
  const dynNotchQ = reader.remaining() >= 2 ? reader.readU16() : 0;             // 39-40
  const dynNotchMinHz = reader.remaining() >= 2 ? reader.readU16() : 0;         // 41-42

  // RPM notch
  const gyroRpmNotchHarmonics = reader.remaining() >= 1 ? reader.readU8() : 0;  // 43
  const gyroRpmNotchMinHz = reader.remaining() >= 1 ? reader.readU8() : 0;      // 44

  const dynNotchMaxHz = reader.remaining() >= 2 ? reader.readU16() : 0;         // 45-46
  const dynLpfCurveExpo = reader.remaining() >= 1 ? reader.readU8() : 0;        // 47
  const dynNotchCount = reader.remaining() >= 1 ? reader.readU8() : 0;          // 48

  return {
    gyroLowpassHz,
    dTermLowpassHz,
    yawLowpassHz,
    gyroNotchHz,
    gyroNotchCutoff,
    dTermNotchHz,
    dTermNotchCutoff,
    gyroNotch2Hz,
    gyroNotch2Cutoff,
    dTermLowpassType,
    gyroHardwareLpf,
    gyroLowpassType,
    gyroLowpass2Hz,
    gyroLowpass2Type,
    dTermLowpass2Hz,
    dTermLowpass2Type,
    gyroLowpassDynMinHz,
    gyroLowpassDynMaxHz,
    dTermLowpassDynMinHz,
    dTermLowpassDynMaxHz,
    dynNotchRange,
    dynNotchWidthPercent,
    dynNotchQ,
    dynNotchMinHz,
    gyroRpmNotchHarmonics,
    gyroRpmNotchMinHz,
    dynNotchMaxHz,
    dynLpfCurveExpo,
    dynNotchCount,
  };
}

/**
 * Serialize MSP_SET_FILTER_CONFIG payload (Betaflight 4.x byte layout)
 *
 * Must match deserializeFilterConfig byte order exactly.
 */
export function serializeFilterConfig(config: MSPFilterConfig): Uint8Array {
  const builder = new PayloadBuilder();

  // Bytes 0-16: core filter settings
  builder.writeU8(config.gyroLowpassHz);              // 0 (legacy U8, will be overwritten by U16 at 20-21)
  builder.writeU16(config.dTermLowpassHz);             // 1-2
  builder.writeU16(config.yawLowpassHz);               // 3-4
  builder.writeU16(config.gyroNotchHz);                // 5-6
  builder.writeU16(config.gyroNotchCutoff);            // 7-8
  builder.writeU16(config.dTermNotchHz);               // 9-10
  builder.writeU16(config.dTermNotchCutoff);           // 11-12
  builder.writeU16(config.gyroNotch2Hz);               // 13-14
  builder.writeU16(config.gyroNotch2Cutoff);           // 15-16

  // Byte 17+: extended fields
  builder.writeU8(config.dTermLowpassType);            // 17
  builder.writeU8(config.gyroHardwareLpf || 0);        // 18
  builder.writeU8(0);                                  // 19: unused (gyro_32khz_hardware_lpf)
  builder.writeU16(config.gyroLowpassHz);              // 20-21 (U16 overwrite)
  builder.writeU16(config.gyroLowpass2Hz);             // 22-23
  builder.writeU8(config.gyroLowpassType);             // 24
  builder.writeU8(config.gyroLowpass2Type);            // 25
  builder.writeU16(config.dTermLowpass2Hz);            // 26-27
  builder.writeU8(config.dTermLowpass2Type);           // 28

  // Dynamic lowpass
  builder.writeU16(config.gyroLowpassDynMinHz || 0);   // 29-30
  builder.writeU16(config.gyroLowpassDynMaxHz || 0);   // 31-32
  builder.writeU16(config.dTermLowpassDynMinHz || 0);  // 33-34
  builder.writeU16(config.dTermLowpassDynMaxHz || 0);  // 35-36

  // Dynamic notch
  builder.writeU8(config.dynNotchRange || 0);          // 37
  builder.writeU8(config.dynNotchWidthPercent);        // 38
  builder.writeU16(config.dynNotchQ);                  // 39-40
  builder.writeU16(config.dynNotchMinHz);              // 41-42

  // RPM notch
  builder.writeU8(config.gyroRpmNotchHarmonics || 0);  // 43
  builder.writeU8(config.gyroRpmNotchMinHz || 0);      // 44

  builder.writeU16(config.dynNotchMaxHz);              // 45-46
  builder.writeU8(config.dynLpfCurveExpo || 0);        // 47
  builder.writeU8(config.dynNotchCount);               // 48

  return builder.build();
}

// =============================================================================
// VTX Configuration (MSP_VTX_CONFIG / MSP_SET_VTX_CONFIG)
// =============================================================================

// VTX device types
export const VTX_TYPE = {
  UNKNOWN: 0,
  TRAMP: 1,
  SMARTAUDIO: 2,
  RTC6705: 3,
  MSP: 4,      // MSP-based VTX (HDZero, etc.)
} as const;

export const VTX_TYPE_NAMES: Record<number, string> = {
  0: 'Unknown',
  1: 'Tramp',
  2: 'SmartAudio',
  3: 'RTC6705',
  4: 'MSP',
};

// VTX bands
export const VTX_BAND = {
  BOSCAM_A: 1,
  BOSCAM_B: 2,
  BOSCAM_E: 3,
  FATSHARK: 4,
  RACEBAND: 5,
} as const;

export const VTX_BAND_NAMES: Record<number, string> = {
  1: 'A (Boscam)',
  2: 'B (Boscam)',
  3: 'E (Boscam)',
  4: 'F (Fatshark)',
  5: 'R (Raceband)',
};

// Standard VTX frequency table (MHz)
export const VTX_FREQUENCY_TABLE: Record<number, Record<number, number>> = {
  // Band A (Boscam A)
  1: { 1: 5865, 2: 5845, 3: 5825, 4: 5805, 5: 5785, 6: 5765, 7: 5745, 8: 5725 },
  // Band B (Boscam B)
  2: { 1: 5733, 2: 5752, 3: 5771, 4: 5790, 5: 5809, 6: 5828, 7: 5847, 8: 5866 },
  // Band E (Boscam E)
  3: { 1: 5705, 2: 5685, 3: 5665, 4: 5645, 5: 5885, 6: 5905, 7: 5925, 8: 5945 },
  // Band F (Fatshark)
  4: { 1: 5740, 2: 5760, 3: 5780, 4: 5800, 5: 5820, 6: 5840, 7: 5860, 8: 5880 },
  // Band R (Raceband)
  5: { 1: 5658, 2: 5695, 3: 5732, 4: 5769, 5: 5806, 6: 5843, 7: 5880, 8: 5917 },
};

// Low power disarm modes
export const VTX_LOW_POWER_DISARM = {
  OFF: 0,
  ON: 1,
  UNTIL_FIRST_ARM: 2,
} as const;

export const VTX_LOW_POWER_DISARM_NAMES: Record<number, string> = {
  0: 'Off',
  1: 'On',
  2: 'Until First Arm',
};

/**
 * VTX Configuration
 */
export interface MSPVtxConfig {
  vtxType: number;              // VTX device type (0=Unknown, 1=Tramp, 2=SmartAudio, etc.)
  band: number;                 // Band (1-5)
  channel: number;              // Channel (1-8)
  power: number;                // Power level index (0-based)
  pitMode: boolean;             // Pit mode enabled
  frequency: number;            // Frequency in MHz (calculated from band/channel or custom)
  deviceReady: boolean;         // VTX device is ready
  lowPowerDisarm: number;       // Low power disarm mode (0=Off, 1=On, 2=Until First Arm)
  pitModeFrequency: number;     // Pit mode frequency (API 1.42+)
  vtxTableAvailable: boolean;   // VTX table is configured
  vtxTableBands: number;        // Number of bands in VTX table
  vtxTableChannels: number;     // Number of channels per band
  vtxTablePowerLevels: number;  // Number of power levels in VTX table
}

/**
 * Deserialize MSP_VTX_CONFIG response
 *
 * Byte structure:
 * - 0: vtxType (U8)
 * - 1: band (U8)
 * - 2: channel (U8)
 * - 3: power (U8)
 * - 4: pitMode (U8, 0/1)
 * - 5-6: frequency (U16 LE)
 * - 7: deviceReady (U8, 0/1)
 * - 8: lowPowerDisarm (U8)
 * - 9-10: pitModeFrequency (U16 LE) - API 1.42+
 * - 11: vtxTableAvailable (U8, 0/1)
 * - 12: vtxTableBands (U8)
 * - 13: vtxTableChannels (U8)
 * - 14: vtxTablePowerLevels (U8)
 */
export function deserializeVtxConfig(payload: Uint8Array): MSPVtxConfig {
  const reader = new PayloadReader(payload);

  const config: MSPVtxConfig = {
    vtxType: reader.readU8(),
    band: reader.readU8(),
    channel: reader.readU8(),
    power: reader.readU8(),
    pitMode: reader.readU8() !== 0,
    frequency: reader.readU16(),
    deviceReady: reader.remaining() >= 1 ? reader.readU8() !== 0 : false,
    lowPowerDisarm: reader.remaining() >= 1 ? reader.readU8() : 0,
    pitModeFrequency: reader.remaining() >= 2 ? reader.readU16() : 0,
    vtxTableAvailable: reader.remaining() >= 1 ? reader.readU8() !== 0 : false,
    vtxTableBands: reader.remaining() >= 1 ? reader.readU8() : 0,
    vtxTableChannels: reader.remaining() >= 1 ? reader.readU8() : 0,
    vtxTablePowerLevels: reader.remaining() >= 1 ? reader.readU8() : 0,
  };

  return config;
}

/**
 * Serialize MSP_SET_VTX_CONFIG payload
 *
 * Betaflight 4.x format:
 * - 0-1: frequency (U16 LE) - if ≤63, packed band/channel; else MHz
 * - 2: power (U8)
 * - 3: pitMode (U8, 0/1)
 * - 4: lowPowerDisarm (U8)
 * - 5-6: pitModeFrequency (U16 LE)
 * - 7: band (U8) - newer versions
 * - 8: channel (U8) - newer versions
 * - 9-10: frequency (U16 LE) - newer versions, actual freq
 * - 11: bandCount (U8) - VTX table info
 * - 12: channelCount (U8)
 * - 13: powerCount (U8)
 * - 14: clearVtxTable (U8)
 */
export function serializeVtxConfig(config: Partial<MSPVtxConfig>): Uint8Array {
  const builder = new PayloadBuilder();

  // Use frequency directly if > 0, otherwise calculate from band/channel
  let frequency = config.frequency || 0;
  if (frequency === 0 && config.band && config.channel) {
    // Look up frequency from table
    const bandTable = VTX_FREQUENCY_TABLE[config.band];
    if (bandTable && bandTable[config.channel]) {
      frequency = bandTable[config.channel];
    }
  }

  // Betaflight 4.x extended format
  builder.writeU16(frequency);                           // frequency or packed band/channel
  builder.writeU8(config.power ?? 0);                    // power level
  builder.writeU8(config.pitMode ? 1 : 0);               // pit mode
  builder.writeU8(config.lowPowerDisarm ?? 0);           // low power disarm
  builder.writeU16(config.pitModeFrequency ?? 0);        // pit mode frequency
  builder.writeU8(config.band ?? 0);                     // band
  builder.writeU8(config.channel ?? 0);                  // channel
  builder.writeU16(frequency);                           // frequency (again, for newer FW)
  builder.writeU8(config.vtxTableBands ?? 0);            // VTX table bands count
  builder.writeU8(config.vtxTableChannels ?? 0);         // VTX table channels count
  builder.writeU8(config.vtxTablePowerLevels ?? 0);      // VTX table power levels count
  builder.writeU8(0);                                    // clear VTX table (0 = don't clear)

  return builder.build();
}

/**
 * Get frequency for a band/channel combination
 */
export function getVtxFrequency(band: number, channel: number): number {
  const bandTable = VTX_FREQUENCY_TABLE[band];
  if (bandTable && bandTable[channel]) {
    return bandTable[channel];
  }
  return 0;
}

// =============================================================================
// OSD Configuration
// =============================================================================

/**
 * OSD element position as read from MSP_OSD_CONFIG
 * Position is packed as U16: ttpp vbyy yyyx xxxx
 * - x: bits 0-4 (5 bits) + bit 10 for HD (6 bits total)
 * - y: bits 5-9 (5 bits)
 * - v: bit 11 = visible flag
 * - b: bit 12 = blink flag (unused)
 * - pp: bits 13-14 = profile (unused for reading)
 * - tt: bits 15-16 = variant type (unused for basic reading)
 */
export interface OsdElementPosition {
  /** Element index in Betaflight's DISPLAY_FIELDS order */
  index: number;
  /** X position (0-29 for SD, 0-59 for HD) */
  x: number;
  /** Y position (0-15 for PAL, 0-12 for NTSC) */
  y: number;
  /** Whether element is visible (in current profile) */
  visible: boolean;
  /** Raw packed value for debugging */
  rawValue: number;
}

/**
 * OSD configuration from MSP_OSD_CONFIG (84)
 */
export interface OsdConfigData {
  /** OSD flags (bit 0 = OSD feature enabled) */
  flags: number;
  /** Video system: 0=Auto, 1=PAL, 2=NTSC, 3=HD */
  videoSystem: number;
  /** Units: 0=Imperial, 1=Metric */
  unitMode: number;
  /** Element positions array */
  elements: OsdElementPosition[];
  /** Number of elements actually returned by FC */
  elementCount: number;
}

/**
 * Betaflight OSD element indices (DISPLAY_FIELDS order)
 * These are the indices in the MSP_OSD_CONFIG element array.
 * Order MUST match Betaflight's osd.js DISPLAY_FIELDS array.
 */
export const BF_OSD_ELEMENT_INDEX = {
  RSSI_VALUE: 0,
  MAIN_BATT_VOLTAGE: 1,
  CROSSHAIRS: 2,
  ARTIFICIAL_HORIZON: 3,
  HORIZON_SIDEBARS: 4,
  TIMER_1: 5,
  TIMER_2: 6,
  FLYMODE: 7,
  CRAFT_NAME: 8,
  THROTTLE_POSITION: 9,
  VTX_CHANNEL: 10,
  CURRENT_DRAW: 11,
  MAH_DRAWN: 12,
  GPS_SPEED: 13,
  GPS_SATS: 14,
  ALTITUDE: 15,
  PID_ROLL: 16,
  PID_PITCH: 17,
  PID_YAW: 18,
  POWER: 19,
  PID_RATE_PROFILE: 20,
  WARNINGS: 21,
  AVG_CELL_VOLTAGE: 22,
  GPS_LON: 23,
  GPS_LAT: 24,
  DEBUG: 25,
  PITCH_ANGLE: 26,
  ROLL_ANGLE: 27,
  MAIN_BATT_USAGE: 28,
  DISARMED: 29,
  HOME_DIR: 30,
  HOME_DIST: 31,
  NUMERICAL_HEADING: 32,
  NUMERICAL_VARIO: 33,
  COMPASS_BAR: 34,
  // ... more elements exist in newer firmware
} as const;

/**
 * Decode OSD element position from packed U16 value
 *
 * Format: ttpp vbyy yyyx xxxx
 * - x: bits 0-4 (5 bits) + ((bits >> 5) & 0x20) for bit 10 HD extension
 * - y: bits 5-9 (5 bits)
 * - v: bit 11 = visible flag (0x0800)
 */
export function decodeOsdPosition(packed: number): { x: number; y: number; visible: boolean } {
  // x position: bits 0-4 + HD extension from bit 10
  const x = ((packed >> 5) & 0x20) | (packed & 0x1f);
  // y position: bits 5-9
  const y = (packed >> 5) & 0x1f;
  // visible: bit 11 (0x0800)
  const visible = (packed & 0x0800) !== 0;
  return { x, y, visible };
}

/**
 * Deserialize MSP_OSD_CONFIG response
 *
 * This reads OSD configuration including element positions from the flight controller.
 * The format is complex and varies by firmware version.
 */
export function deserializeOsdConfig(payload: Uint8Array): OsdConfigData {
  const reader = new PayloadReader(payload);

  // Read flags first
  const flags = reader.readU8();

  // Default result
  const result: OsdConfigData = {
    flags,
    videoSystem: 0,
    unitMode: 0,
    elements: [],
    elementCount: 0,
  };

  // If flags is 0 or no more data, OSD is not configured
  if (flags === 0 || reader.remaining() < 1) {
    return result;
  }

  // Video system
  result.videoSystem = reader.readU8();

  // If OSD feature is enabled (bit 0 of flags)
  if ((flags & 0x01) !== 0 && reader.remaining() >= 6) {
    // Unit mode
    result.unitMode = reader.readU8();

    // Alarms (skip)
    reader.readU8();  // rssi alarm
    reader.readU16(); // capacity alarm

    // Skip obsolete byte, read element count
    reader.readU8();  // obsolete
    result.elementCount = reader.readU8();

    // Skip altitude alarm
    if (reader.remaining() >= 2) {
      reader.readU16(); // alt alarm
    }
  }

  // Read element positions
  // If elementCount wasn't set, read all remaining U16 values
  const expectedElements = result.elementCount || Math.floor(reader.remaining() / 2);
  let index = 0;

  while (reader.remaining() >= 2 && index < expectedElements) {
    const rawValue = reader.readU16();
    const decoded = decodeOsdPosition(rawValue);

    result.elements.push({
      index,
      x: decoded.x,
      y: decoded.y,
      visible: decoded.visible,
      rawValue,
    });

    index++;
  }

  return result;
}

// =============================================================================
// RX Config (MSP_RX_CONFIG)
// =============================================================================

/**
 * Betaflight serialrx_provider values
 */
export const SERIALRX_PROVIDER = {
  SPEK1024: 0,
  SPEK2048: 1,
  SBUS: 2,
  SUMD: 3,
  SUMH: 4,
  XBUS_MODE_B: 5,
  XBUS_MODE_B_RJ01: 6,
  IBUS: 7,
  JETIEXBUS: 8,
  CRSF: 9,
  SRXL: 10,
  TARGET_CUSTOM: 11,
  FPORT: 12,
  SRXL2: 13,
  GHST: 14,
  MSP: 15,
} as const;

/**
 * Reverse map: number to string
 */
export const SERIALRX_PROVIDER_NAMES: Record<number, string> = {
  0: 'SPEK1024',
  1: 'SPEK2048',
  2: 'SBUS',
  3: 'SUMD',
  4: 'SUMH',
  5: 'XBUS_MODE_B',
  6: 'XBUS_MODE_B_RJ01',
  7: 'IBUS',
  8: 'JETIEXBUS',
  9: 'CRSF',
  10: 'SRXL',
  11: 'TARGET_CUSTOM',
  12: 'FPORT',
  13: 'SRXL2',
  14: 'GHST',
  15: 'MSP',
};

export interface MSPRxConfig {
  serialrxProvider: number;
  serialrxProviderName: string;
  /** Raw payload bytes - needed for read-modify-write via MSP_SET_RX_CONFIG */
  rawPayload: Uint8Array;
}

/**
 * Deserialize MSP_RX_CONFIG (44) response
 * Keeps the raw payload for read-modify-write pattern
 */
export function deserializeRxConfig(payload: Uint8Array): MSPRxConfig {
  const serialrxProvider = payload.length > 0 ? payload[0]! : 0;

  return {
    serialrxProvider,
    serialrxProviderName: SERIALRX_PROVIDER_NAMES[serialrxProvider] ?? 'UNKNOWN',
    rawPayload: new Uint8Array(payload),
  };
}

/**
 * Serialize MSP_SET_RX_CONFIG (45) payload
 * Uses the read-modify-write pattern: takes the original raw payload
 * and replaces byte 0 (serialrx_provider) with the new value
 */
export function serializeRxConfig(originalPayload: Uint8Array, newSerialrxProvider: number): Uint8Array {
  const payload = new Uint8Array(originalPayload);
  payload[0] = newSerialrxProvider;
  return payload;
}
