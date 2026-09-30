/**
 * MAVLink/ArduPilot Configuration Presets
 *
 * Provides one-click configurations for:
 * - Skill levels (Beginner, Intermediate, Expert)
 * - Mission types (Mapping, Surveillance, Sport, Cinema)
 * - Flight mode templates
 * - Safety configurations
 */

import { Egg, Drama, Zap, Film, type LucideIcon } from 'lucide-react';

// =============================================================================
// Flight Mode Presets
// =============================================================================

export interface FlightModePreset {
  name: string;
  nameKey: string;
  description: string;
  descKey: string;
  modes: number[]; // FLTMODE1-6 values
}

export const FLIGHT_MODE_PRESETS: Record<string, FlightModePreset> = {
  beginner: {
    name: 'Beginner Safe',
    nameKey: 'flightModePresets.beginner',
    description: 'Safe modes only - Stabilize, AltHold, Loiter, RTL',
    descKey: 'flightModePresets.beginner',
    modes: [0, 2, 5, 6, 9, 6], // Stabilize, AltHold, Loiter, RTL, Land, RTL
  },
  intermediate: {
    name: 'Intermediate',
    nameKey: 'flightModePresets.intermediate',
    description: 'Add Auto and PosHold for missions',
    descKey: 'flightModePresets.intermediate',
    modes: [0, 2, 5, 3, 16, 6], // Stabilize, AltHold, Loiter, Auto, PosHold, RTL
  },
  advanced: {
    name: 'Advanced',
    nameKey: 'flightModePresets.advanced',
    description: 'Full control with Acro and Sport modes',
    descKey: 'flightModePresets.advanced',
    modes: [0, 1, 13, 5, 3, 6], // Stabilize, Acro, Sport, Loiter, Auto, RTL
  },
  mapping: {
    name: 'Mapping/Survey',
    nameKey: 'flightModePresets.mapping',
    description: 'Optimized for aerial mapping missions',
    descKey: 'flightModePresets.mapping',
    modes: [5, 3, 24, 6, 9, 21], // Loiter, Auto, ZigZag, RTL, Land, SmartRTL
  },
};

export const PLANE_FLIGHT_MODE_PRESETS: Record<string, FlightModePreset> = {
  beginner: {
    name: 'Beginner Safe',
    nameKey: 'planeFlightModePresets.beginner',
    description: 'Safe modes - FBWA, Loiter, RTL',
    descKey: 'planeFlightModePresets.beginner',
    modes: [5, 5, 12, 12, 11, 11], // FBWA, FBWA, Loiter, Loiter, RTL, RTL
  },
  intermediate: {
    name: 'Intermediate',
    nameKey: 'planeFlightModePresets.intermediate',
    description: 'Add Auto and Cruise for missions',
    descKey: 'planeFlightModePresets.intermediate',
    modes: [5, 7, 12, 10, 11, 11], // FBWA, Cruise, Loiter, Auto, RTL, RTL
  },
  advanced: {
    name: 'Advanced',
    nameKey: 'planeFlightModePresets.advanced',
    description: 'Full control with Manual and Acro',
    descKey: 'planeFlightModePresets.advanced',
    modes: [0, 4, 5, 12, 10, 11], // Manual, Acro, FBWA, Loiter, Auto, RTL
  },
  vtol: {
    name: 'VTOL QuadPlane',
    nameKey: 'planeFlightModePresets.vtol',
    description: 'QLoiter, FBWA, QRTL for VTOL aircraft',
    descKey: 'planeFlightModePresets.vtol',
    modes: [19, 19, 5, 5, 21, 21], // QLoiter, QLoiter, FBWA, FBWA, QRTL, QRTL
  },
};

// =============================================================================
// Skill Level Presets (Tuning)
// =============================================================================

export interface SkillPreset {
  name: string;
  nameKey: string;
  description: string;
  descKey: string;
  params: Record<string, number>;
}

export const SKILL_PRESETS: Record<string, SkillPreset> = {
  beginner: {
    name: 'Beginner',
    nameKey: 'skillPresets.beginner',
    description: 'Soft, forgiving response. Great for learning.',
    descKey: 'skillPresets.beginner',
    params: {
      // Slower rates
      'ACRO_RP_RATE': 90,
      'ACRO_Y_RATE': 67.5,
      // Lower angle limits
      'ANGLE_MAX': 3000, // 30 degrees
      // Position controller - slower
      'PSC_VELXY_P': 3.0,
      'PSC_POSXY_P': 0.8,
      // Loiter speed limits
      'LOIT_SPEED': 500, // 5 m/s max
      'LOIT_ACC_MAX': 200,
    },
  },
  intermediate: {
    name: 'Intermediate',
    nameKey: 'skillPresets.intermediate',
    description: 'Balanced response for general flying.',
    descKey: 'skillPresets.intermediate',
    params: {
      'ACRO_RP_RATE': 180,
      'ACRO_Y_RATE': 90,
      'ANGLE_MAX': 4500, // 45 degrees
      'PSC_VELXY_P': 4.0,
      'PSC_POSXY_P': 1.0,
      'LOIT_SPEED': 1000, // 10 m/s
      'LOIT_ACC_MAX': 400,
    },
  },
  expert: {
    name: 'Expert',
    nameKey: 'skillPresets.expert',
    description: 'Aggressive response for experienced pilots.',
    descKey: 'skillPresets.expert',
    params: {
      'ACRO_RP_RATE': 360,
      'ACRO_Y_RATE': 180,
      'ANGLE_MAX': 6000, // 60 degrees
      'PSC_VELXY_P': 5.0,
      'PSC_POSXY_P': 1.2,
      'LOIT_SPEED': 1500, // 15 m/s
      'LOIT_ACC_MAX': 600,
    },
  },
};

// =============================================================================
// Mission Type Presets
// =============================================================================

export interface MissionPreset {
  name: string;
  nameKey: string;
  description: string;
  descKey: string;
  params: Record<string, number>;
}

export const MISSION_PRESETS: Record<string, MissionPreset> = {
  mapping: {
    name: 'Mapping/Survey',
    nameKey: 'missionPresets.mapping',
    description: 'Slow, stable flight for aerial mapping and photogrammetry.',
    descKey: 'missionPresets.mapping',
    params: {
      'WPNAV_SPEED': 500, // 5 m/s - slow for photos
      'WPNAV_ACCEL': 100,
      'WPNAV_RADIUS': 200, // 2m waypoint radius
      'LOIT_SPEED': 500,
      'ANGLE_MAX': 2000, // 20 degrees - keep level for camera
    },
  },
  surveillance: {
    name: 'Surveillance',
    nameKey: 'missionPresets.surveillance',
    description: 'Moderate speed, good stability for video.',
    descKey: 'missionPresets.surveillance',
    params: {
      'WPNAV_SPEED': 800, // 8 m/s
      'WPNAV_ACCEL': 150,
      'WPNAV_RADIUS': 300,
      'LOIT_SPEED': 800,
      'ANGLE_MAX': 3000, // 30 degrees
    },
  },
  sport: {
    name: 'Sport',
    nameKey: 'missionPresets.sport',
    description: 'Fast, responsive flight for fun flying.',
    descKey: 'missionPresets.sport',
    params: {
      'WPNAV_SPEED': 1500, // 15 m/s
      'WPNAV_ACCEL': 400,
      'WPNAV_RADIUS': 500,
      'LOIT_SPEED': 1500,
      'ANGLE_MAX': 5500, // 55 degrees
    },
  },
  cinema: {
    name: 'Cinematic',
    nameKey: 'missionPresets.cinema',
    description: 'Ultra-smooth movements for professional video.',
    descKey: 'missionPresets.cinema',
    params: {
      'WPNAV_SPEED': 300, // 3 m/s - very slow
      'WPNAV_ACCEL': 50, // Very gentle acceleration
      'WPNAV_RADIUS': 150,
      'LOIT_SPEED': 300,
      'LOIT_ACC_MAX': 100, // Gentle loiter
      'ANGLE_MAX': 1500, // 15 degrees - minimal tilt
    },
  },
};

// =============================================================================
// Safety Presets
// =============================================================================

export interface SafetyPreset {
  name: string;
  nameKey: string;
  description: string;
  descKey: string;
  params: Record<string, number>;
}

export const SAFETY_PRESETS: Record<string, SafetyPreset> = {
  maximum: {
    name: 'Maximum Safety',
    nameKey: 'safetyPresets.maximum',
    description: 'All safety features enabled. Recommended for beginners.',
    descKey: 'safetyPresets.maximum',
    params: {
      'FS_THR_ENABLE': 1, // RTL on throttle failsafe
      'FS_GCS_ENABLE': 1, // RTL on GCS failsafe
      'BATT_FS_LOW_ACT': 2, // Land on battery failsafe
      'BATT_FS_CRT_ACT': 1, // Land immediately on critical battery
      'FENCE_ENABLE': 1,
      'FENCE_TYPE': 7, // All fence types
      'ARMING_CHECK': 1, // All arming checks
    },
  },
  balanced: {
    name: 'Balanced',
    nameKey: 'safetyPresets.balanced',
    description: 'Essential safety features without being restrictive.',
    descKey: 'safetyPresets.balanced',
    params: {
      'FS_THR_ENABLE': 1,
      'FS_GCS_ENABLE': 0, // No GCS failsafe
      'BATT_FS_LOW_ACT': 1, // RTL on battery failsafe
      'BATT_FS_CRT_ACT': 1, // Land immediately on critical battery
      'FENCE_ENABLE': 1,
      'FENCE_TYPE': 3, // Altitude + circle only
      'ARMING_CHECK': 1,
    },
  },
  minimal: {
    name: 'Minimal',
    nameKey: 'safetyPresets.minimal',
    description: 'Only critical safety features. For experienced pilots.',
    descKey: 'safetyPresets.minimal',
    params: {
      'FS_THR_ENABLE': 1, // Keep throttle failsafe
      'FS_GCS_ENABLE': 0,
      'BATT_FS_LOW_ACT': 0,
      'BATT_FS_CRT_ACT': 0, // No critical battery action
      'FENCE_ENABLE': 0,
      'ARMING_CHECK': 0, // Bypass arming checks (dangerous!)
    },
  },
};

// =============================================================================
// Failsafe Actions
// =============================================================================

export const FAILSAFE_ACTIONS: Record<number, { name: string; nameKey: string; description: string; descKey: string; safe: boolean }> = {
  0: { name: 'Disabled', nameKey: 'failsafeActions.0', description: 'No action taken', descKey: 'failsafeActions.0', safe: false },
  1: { name: 'RTL', nameKey: 'failsafeActions.1', description: 'Return to launch point', descKey: 'failsafeActions.1', safe: true },
  2: { name: 'Land', nameKey: 'failsafeActions.2', description: 'Land immediately', descKey: 'failsafeActions.2', safe: true },
  3: { name: 'SmartRTL', nameKey: 'failsafeActions.3', description: 'Return via original path', descKey: 'failsafeActions.3', safe: true },
  4: { name: 'Brake', nameKey: 'failsafeActions.4', description: 'Stop and hover', descKey: 'failsafeActions.4', safe: true },
  5: { name: 'Land', nameKey: 'failsafeActions.5', description: 'Land at current position', descKey: 'failsafeActions.5', safe: true },
};

// =============================================================================
// Arming Check Flags
// =============================================================================

export const ARMING_CHECKS: Record<number, { name: string; nameKey: string; description: string; descKey: string }> = {
  1: { name: 'All', nameKey: 'armingChecks.1', description: 'Enable all arming checks', descKey: 'armingChecks.1' },
  2: { name: 'Barometer', nameKey: 'armingChecks.2', description: 'Check barometer health', descKey: 'armingChecks.2' },
  4: { name: 'Compass', nameKey: 'armingChecks.4', description: 'Check compass health and calibration', descKey: 'armingChecks.4' },
  8: { name: 'GPS Lock', nameKey: 'armingChecks.8', description: 'Require GPS lock before arming', descKey: 'armingChecks.8' },
  16: { name: 'INS', nameKey: 'armingChecks.16', description: 'Check accelerometer/gyro health', descKey: 'armingChecks.16' },
  32: { name: 'Parameters', nameKey: 'armingChecks.32', description: 'Check for invalid parameters', descKey: 'armingChecks.32' },
  64: { name: 'RC Channels', nameKey: 'armingChecks.64', description: 'Check RC receiver is working', descKey: 'armingChecks.64' },
  128: { name: 'Board Voltage', nameKey: 'armingChecks.128', description: 'Check board voltage is stable', descKey: 'armingChecks.128' },
  256: { name: 'Battery Level', nameKey: 'armingChecks.256', description: 'Check battery has sufficient charge', descKey: 'armingChecks.256' },
  512: { name: 'Airspeed', nameKey: 'armingChecks.512', description: 'Check airspeed sensor (planes)', descKey: 'armingChecks.512' },
  1024: { name: 'Logging', nameKey: 'armingChecks.1024', description: 'Check logging is working', descKey: 'armingChecks.1024' },
  2048: { name: 'Safety Switch', nameKey: 'armingChecks.2048', description: 'Check safety switch is disengaged', descKey: 'armingChecks.2048' },
  4096: { name: 'GPS Config', nameKey: 'armingChecks.4096', description: 'Check GPS configuration', descKey: 'armingChecks.4096' },
  8192: { name: 'System', nameKey: 'armingChecks.8192', description: 'Check system health', descKey: 'armingChecks.8192' },
  16384: { name: 'Mission', nameKey: 'armingChecks.16384', description: 'Check mission is valid', descKey: 'armingChecks.16384' },
  32768: { name: 'Rangefinder', nameKey: 'armingChecks.32768', description: 'Check rangefinder health', descKey: 'armingChecks.32768' },
};

// =============================================================================
// Fence Types
// =============================================================================

export const FENCE_TYPES: Record<number, { name: string; nameKey: string; description: string; descKey: string }> = {
  0: { name: 'Disabled', nameKey: 'fenceTypes.0', description: 'No geofence active', descKey: 'fenceTypes.0' },
  1: { name: 'Altitude', nameKey: 'fenceTypes.1', description: 'Maximum altitude limit', descKey: 'fenceTypes.1' },
  2: { name: 'Circle', nameKey: 'fenceTypes.2', description: 'Circular boundary around home', descKey: 'fenceTypes.2' },
  3: { name: 'Altitude + Circle', nameKey: 'fenceTypes.3', description: 'Both altitude and circular limits', descKey: 'fenceTypes.3' },
  4: { name: 'Polygon', nameKey: 'fenceTypes.4', description: 'Custom polygon boundary', descKey: 'fenceTypes.4' },
  7: { name: 'All', nameKey: 'fenceTypes.7', description: 'Altitude, circle, and polygon', descKey: 'fenceTypes.7' },
};

// =============================================================================
// Battery Monitor Types
// =============================================================================

export const BATTERY_MONITORS: Record<number, { name: string; nameKey: string; description: string; descKey: string }> = {
  0: { name: 'Disabled', nameKey: 'batteryMonitors.0', description: 'No battery monitoring', descKey: 'batteryMonitors.0' },
  3: { name: 'Analog Voltage Only', nameKey: 'batteryMonitors.3', description: 'Basic voltage monitoring', descKey: 'batteryMonitors.3' },
  4: { name: 'Analog Voltage + Current', nameKey: 'batteryMonitors.4', description: 'Full power monitoring', descKey: 'batteryMonitors.4' },
  5: { name: 'Solo', nameKey: 'batteryMonitors.5', description: '3DR Solo battery', descKey: 'batteryMonitors.5' },
  6: { name: 'Bebop', nameKey: 'batteryMonitors.6', description: 'Parrot Bebop battery', descKey: 'batteryMonitors.6' },
  7: { name: 'SMBus-Maxell', nameKey: 'batteryMonitors.7', description: 'Maxell smart battery', descKey: 'batteryMonitors.7' },
  8: { name: 'UAVCAN', nameKey: 'batteryMonitors.8', description: 'UAVCAN battery', descKey: 'batteryMonitors.8' },
  9: { name: 'BLHeli ESC', nameKey: 'batteryMonitors.9', description: 'BLHeli telemetry', descKey: 'batteryMonitors.9' },
  10: { name: 'Sum of Selected', nameKey: 'batteryMonitors.10', description: 'Sum multiple monitors', descKey: 'batteryMonitors.10' },
  11: { name: 'FuelFlow', nameKey: 'batteryMonitors.11', description: 'Fuel flow sensor', descKey: 'batteryMonitors.11' },
  12: { name: 'FuelLevel PWM', nameKey: 'batteryMonitors.12', description: 'Fuel level PWM sensor', descKey: 'batteryMonitors.12' },
};

// =============================================================================
// Battery Chemistry Types
// =============================================================================

export type BatteryChemistry = 'lipo' | 'lihv' | 'lion' | 'life';

export interface BatteryChemistryInfo {
  name: string;
  nameKey: string;
  description: string;
  descKey: string;
  /** Per-cell voltages */
  cellFull: number;
  cellNominal: number;
  cellStorage: number;
  /** ArduPilot-safe thresholds - enough margin for RTL */
  cellLow: number;
  cellCritical: number;
  cellMin: number;
}

export const BATTERY_CHEMISTRIES: Record<BatteryChemistry, BatteryChemistryInfo> = {
  lipo: {
    name: 'LiPo',
    nameKey: 'batteryChemistries.lipo',
    description: 'Standard lithium polymer - most common for RC',
    descKey: 'batteryChemistries.lipo',
    cellFull: 4.2,
    cellNominal: 3.7,
    cellStorage: 3.8,
    cellLow: 3.6,
    cellCritical: 3.5,
    cellMin: 3.0,
  },
  lihv: {
    name: 'LiHV',
    nameKey: 'batteryChemistries.lihv',
    description: 'High-voltage LiPo - 4.35V full charge',
    descKey: 'batteryChemistries.lihv',
    cellFull: 4.35,
    cellNominal: 3.8,
    cellStorage: 3.9,
    cellLow: 3.7,
    cellCritical: 3.6,
    cellMin: 3.1,
  },
  lion: {
    name: 'Li-Ion',
    nameKey: 'batteryChemistries.lion',
    description: 'Lithium-ion - higher energy density, lower discharge rate',
    descKey: 'batteryChemistries.lion',
    cellFull: 4.2,
    cellNominal: 3.6,
    cellStorage: 3.7,
    cellLow: 3.2,
    cellCritical: 3.0,
    cellMin: 2.5,
  },
  life: {
    name: 'LiFePO4',
    nameKey: 'batteryChemistries.life',
    description: 'Lithium iron phosphate - very stable, long cycle life',
    descKey: 'batteryChemistries.life',
    cellFull: 3.6,
    cellNominal: 3.3,
    cellStorage: 3.3,
    cellLow: 3.1,
    cellCritical: 3.0,
    cellMin: 2.5,
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate cell voltages for any chemistry and cell count.
 * Thresholds are set conservatively for ArduPilot - enough margin for RTL.
 */
export function getCellVoltages(cells: number, chemistry: BatteryChemistry = 'lipo') {
  const chem = BATTERY_CHEMISTRIES[chemistry];
  return {
    nominal: cells * chem.cellNominal,
    full: cells * chem.cellFull,
    storage: cells * chem.cellStorage,
    low: cells * chem.cellLow,
    critical: cells * chem.cellCritical,
    min: cells * chem.cellMin,
  };
}

/**
 * Calculate LiPo cell voltages (legacy wrapper)
 */
export function getLiPoVoltages(cells: number) {
  return getCellVoltages(cells, 'lipo');
}

// =============================================================================
// PID Tuning Presets (ArduPilot)
// =============================================================================

/** Abstract PID values per axis (scheme-agnostic) */
export interface PidAxisValues {
  p: number;
  i: number;
  d: number;
  ff?: number;
}

export interface PidPreset {
  name: string;
  nameKey: string;
  description: string;
  descKey: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  /** Abstract PID values - mapped to actual param names via PidScheme at apply time */
  values: {
    roll: PidAxisValues;
    pitch: PidAxisValues;
    yaw: PidAxisValues;
  };
  /** Optional acceleration limit values in cdeg/s² (applied when scheme supports accel) */
  accel?: { roll: number; pitch: number; yaw: number };
}

export const PID_PRESETS: Record<string, PidPreset> = {
  beginner: {
    name: 'Beginner',
    nameKey: 'pidPresets.beginner',
    description: 'Smooth & forgiving - great for learning',
    descKey: 'pidPresets.beginner',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    values: {
      roll:  { p: 0.08, i: 0.08, d: 0.003, ff: 0 },
      pitch: { p: 0.08, i: 0.08, d: 0.003, ff: 0 },
      yaw:   { p: 0.15, i: 0.015, d: 0, ff: 0 },
    },
    accel: { roll: 80000, pitch: 80000, yaw: 20000 },
  },
  freestyle: {
    name: 'Freestyle',
    nameKey: 'pidPresets.freestyle',
    description: 'Responsive & smooth for tricks',
    descKey: 'pidPresets.freestyle',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    values: {
      roll:  { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
      pitch: { p: 0.135, i: 0.135, d: 0.0036, ff: 0 },
      yaw:   { p: 0.2, i: 0.02, d: 0, ff: 0 },
    },
    accel: { roll: 110000, pitch: 110000, yaw: 27000 },
  },
  racing: {
    name: 'Racing',
    nameKey: 'pidPresets.racing',
    description: 'Snappy & precise for speed',
    descKey: 'pidPresets.racing',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    values: {
      roll:  { p: 0.18, i: 0.18, d: 0.004, ff: 0 },
      pitch: { p: 0.18, i: 0.18, d: 0.004, ff: 0 },
      yaw:   { p: 0.25, i: 0.025, d: 0, ff: 0 },
    },
    accel: { roll: 160000, pitch: 160000, yaw: 40000 },
  },
  cinematic: {
    name: 'Cinematic',
    nameKey: 'pidPresets.cinematic',
    description: 'Ultra-smooth for video',
    descKey: 'pidPresets.cinematic',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    values: {
      roll:  { p: 0.06, i: 0.06, d: 0.002, ff: 0 },
      pitch: { p: 0.06, i: 0.06, d: 0.002, ff: 0 },
      yaw:   { p: 0.12, i: 0.012, d: 0, ff: 0 },
    },
    accel: { roll: 55000, pitch: 55000, yaw: 14000 },
  },
};

// =============================================================================
// Rate Presets (ArduPilot)
// =============================================================================

/** Abstract rate values (scheme-agnostic) */
export interface RateValues {
  rpRate: number;
  yawRate: number;
  rpExpo: number;
  yawExpo: number;
}

export interface RatePreset {
  name: string;
  nameKey: string;
  description: string;
  descKey: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  /** Abstract rate values - mapped to actual param names via RateScheme at apply time */
  values: RateValues;
}

export const RATE_PRESETS: Record<string, RatePreset> = {
  beginner: {
    name: 'Beginner',
    nameKey: 'ratePresets.beginner',
    description: 'Slow & predictable - great for learning',
    descKey: 'ratePresets.beginner',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    values: { rpRate: 90, yawRate: 45, rpExpo: 0.3, yawExpo: 0.2 },
  },
  freestyle: {
    name: 'Freestyle',
    nameKey: 'ratePresets.freestyle',
    description: 'Balanced for tricks & flow',
    descKey: 'ratePresets.freestyle',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    values: { rpRate: 180, yawRate: 90, rpExpo: 0.2, yawExpo: 0.15 },
  },
  racing: {
    name: 'Racing',
    nameKey: 'ratePresets.racing',
    description: 'Fast & responsive for speed',
    descKey: 'ratePresets.racing',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    values: { rpRate: 360, yawRate: 180, rpExpo: 0.1, yawExpo: 0.1 },
  },
  cinematic: {
    name: 'Cinematic',
    nameKey: 'ratePresets.cinematic',
    description: 'Ultra-smooth for filming',
    descKey: 'ratePresets.cinematic',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    values: { rpRate: 60, yawRate: 30, rpExpo: 0.4, yawExpo: 0.3 },
  },
};
