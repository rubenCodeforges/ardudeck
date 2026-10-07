/**
 * Flight-mode tables and decoders shared by the ArduDeck desktop app and the
 * ArduDeck OS link service. Pure data: no i18n, no Electron, no Node APIs.
 */

// Flight modes for ArduPilot Copter
export const COPTER_MODES: Record<number, string> = {
  0: 'Stabilize',
  1: 'Acro',
  2: 'AltHold',
  3: 'Auto',
  4: 'Guided',
  5: 'Loiter',
  6: 'RTL',
  7: 'Circle',
  9: 'Land',
  11: 'Drift',
  13: 'Sport',
  14: 'Flip',
  15: 'AutoTune',
  16: 'PosHold',
  17: 'Brake',
  18: 'Throw',
  19: 'Avoid_ADSB',
  20: 'Guided_NoGPS',
  21: 'Smart_RTL',
  22: 'FlowHold',
  23: 'Follow',
  24: 'ZigZag',
  25: 'SystemID',
  26: 'Heli_Autorotate',
  27: 'Auto RTL', // i18n-exempt
};

// Flight modes for ArduPilot Plane
export const PLANE_MODES: Record<number, string> = {
  0: 'Manual',
  1: 'Circle',
  2: 'Stabilize',
  3: 'Training',
  4: 'Acro',
  5: 'FlyByWireA',
  6: 'FlyByWireB',
  7: 'Cruise',
  8: 'AutoTune',
  10: 'Auto',
  11: 'RTL',
  12: 'Loiter',
  13: 'Takeoff',
  14: 'Avoid_ADSB',
  15: 'Guided',
  17: 'QStabilize',
  18: 'QHover',
  19: 'QLoiter',
  20: 'QLand',
  21: 'QRTL',
  22: 'QAutotune',
  23: 'QAcro',
  24: 'Thermal',
  25: 'Loiter to QLand', // i18n-exempt
};

// Flight modes for ArduPilot Rover (also used by Boat)
export const ROVER_MODES: Record<number, string> = {
  0: 'Manual',
  1: 'Acro',
  3: 'Steering',
  4: 'Hold',
  5: 'Loiter',
  6: 'Follow',
  7: 'Simple',
  8: 'Dock',
  9: 'Circle',
  10: 'Auto',
  11: 'RTL',
  12: 'Smart RTL', // i18n-exempt
  15: 'Guided',
  16: 'Initializing',
};

// Flight modes for ArduPilot Sub
export const SUB_MODES: Record<number, string> = {
  0: 'Stabilize',
  1: 'Acro',
  2: 'AltHold',
  3: 'Auto',
  4: 'Guided',
  7: 'Circle',
  9: 'Surface',
  16: 'PosHold',
  19: 'Manual',
  20: 'MotorDetect',
  21: 'SurfTrak',
};

// PX4 flight modes. Unlike ArduPilot, PX4 encodes the mode in a bitfield:
//   main_mode = (customMode >> 16) & 0xFF
//   sub_mode  = (customMode >> 24) & 0xFF
// Source: QGroundControl px4_custom_mode.h (PX4_CUSTOM_MAIN_MODE /
// PX4_CUSTOM_SUB_MODE_AUTO / PX4_CUSTOM_SUB_MODE_POSCTL) and the name
// mapping in PX4FirmwarePlugin.cc.
export const PX4_MAIN_MODES: Record<number, string> = {
  1: 'Manual',
  2: 'Altitude',
  3: 'Position',
  4: 'Auto',
  5: 'Acro',
  6: 'Offboard',
  7: 'Stabilized',
  8: 'Rattitude',
  9: 'Simple',
};

// sub_mode when main_mode === AUTO (4)
const PX4_AUTO_SUB_MODES: Record<number, string> = {
  1: 'Ready',
  2: 'Takeoff',
  3: 'Hold',
  4: 'Mission',
  5: 'Return',
  6: 'Land',
  7: 'Return to Groundstation', // i18n-exempt
  8: 'Follow Me', // i18n-exempt
  9: 'Precision Land', // i18n-exempt
};

// sub_mode when main_mode === POSCTL (3)
const PX4_POSCTL_SUB_MODES: Record<number, string> = {
  0: 'Position',
  1: 'Orbit',
};

const PX4_MAIN_MODE_AUTO = 4;
const PX4_MAIN_MODE_POSCTL = 3;

/**
 * Decode a PX4 HEARTBEAT.custom_mode into a human-readable flight-mode name.
 * Mirrors the ArduPilot table lookups but follows PX4's main/sub bitfield.
 */
export function getPx4ModeName(customMode: number): string {
  const mainMode = (customMode >> 16) & 0xff;
  const subMode = (customMode >> 24) & 0xff;
  if (mainMode === PX4_MAIN_MODE_AUTO) {
    return PX4_AUTO_SUB_MODES[subMode] || `Auto ${subMode}`;
  }
  if (mainMode === PX4_MAIN_MODE_POSCTL) {
    return PX4_POSCTL_SUB_MODES[subMode] || 'Position';
  }
  return PX4_MAIN_MODES[mainMode] || `Mode ${customMode}`;
}

/**
 * Encode a PX4 commanded flight mode into a HEARTBEAT/SET_MODE custom_mode.
 * PX4 packs the mode selector into the upper bytes of custom_mode:
 *   custom_mode = ((mainMode & 0xFF) << 16) | ((subMode & 0xFF) << 24)
 * Mirrors px4_custom_mode.h (the `union px4_custom_mode` layout used by QGC).
 * The value produced here is also what getPx4ModeName() decodes, so a
 * commanded mode and the heartbeat echoed back match byte-for-byte.
 */
export function encodePx4CustomMode(mainMode: number, subMode: number): number {
  // >>> 0 keeps the result an unsigned 32-bit integer; subMode << 24 would
  // otherwise be interpreted as negative once the top bit is set.
  return (((mainMode & 0xff) << 16) | ((subMode & 0xff) << 24)) >>> 0;
}

// User-selectable PX4 flight modes for the live mode-command UI. mainMode /
// subMode values come straight from px4_custom_mode.h (PX4_CUSTOM_MAIN_MODE_*
// and PX4_CUSTOM_SUB_MODE_AUTO_*). Modes without a sub_mode use subMode 0.
export const PX4_FLIGHT_MODES: { name: string; mainMode: number; subMode: number }[] = [
  { name: 'Manual',     mainMode: 1, subMode: 0 },
  { name: 'Stabilized', mainMode: 7, subMode: 0 },
  { name: 'Acro',       mainMode: 5, subMode: 0 },
  { name: 'Altitude',   mainMode: 2, subMode: 0 },
  { name: 'Position',   mainMode: 3, subMode: 0 },
  { name: 'Hold',       mainMode: 4, subMode: 3 }, // AUTO_LOITER
  { name: 'Mission',    mainMode: 4, subMode: 4 }, // AUTO_MISSION
  { name: 'Return',     mainMode: 4, subMode: 5 }, // AUTO_RTL
  { name: 'Takeoff',    mainMode: 4, subMode: 2 }, // AUTO_TAKEOFF
  { name: 'Land',       mainMode: 4, subMode: 6 }, // AUTO_LAND
  { name: 'Offboard',   mainMode: 6, subMode: 0 },
];

/** MAV_AUTOPILOT_PX4 */
const AUTOPILOT_PX4 = 12;

/**
 * Human-readable flight mode for a HEARTBEAT. PX4 keys its main/sub bitfield
 * off the autopilot; ArduPilot picks the table by MAV_TYPE. Falls back to
 * `Mode <n>` for unknown vehicles or modes, matching the desktop app.
 */
export function getFlightModeName(autopilot: number, mavType: number, customMode: number): string {
  const fallback = `Mode ${customMode}`;
  if (autopilot === AUTOPILOT_PX4) return getPx4ModeName(customMode);
  if (mavType === 1 || (mavType >= 19 && mavType <= 25)) return PLANE_MODES[customMode] || fallback;
  if (mavType === 2 || (mavType >= 13 && mavType <= 15) || mavType === 29 || mavType === 35) return COPTER_MODES[customMode] || fallback;
  if (mavType === 10 || mavType === 11) return ROVER_MODES[customMode] || fallback;
  if (mavType === 12) return SUB_MODES[customMode] || fallback;
  return fallback;
}
