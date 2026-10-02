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
  nameKey: string;
  descriptionKey: string;
  modes: number[]; // FLTMODE1-6 values
}

export const FLIGHT_MODE_PRESETS: Record<string, FlightModePreset> = {
  beginner: {
    nameKey: 'mavlink-config:mavlinkPresets.flightMode.beginner.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.flightMode.beginner.description',
    modes: [0, 2, 5, 6, 9, 6], // Stabilize, AltHold, Loiter, RTL, Land, RTL
  },
  intermediate: {
    nameKey: 'mavlink-config:mavlinkPresets.flightMode.intermediate.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.flightMode.intermediate.description',
    modes: [0, 2, 5, 3, 16, 6], // Stabilize, AltHold, Loiter, Auto, PosHold, RTL
  },
  advanced: {
    nameKey: 'mavlink-config:mavlinkPresets.flightMode.advanced.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.flightMode.advanced.description',
    modes: [0, 1, 13, 5, 3, 6], // Stabilize, Acro, Sport, Loiter, Auto, RTL
  },
  mapping: {
    nameKey: 'mavlink-config:mavlinkPresets.flightMode.mapping.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.flightMode.mapping.description',
    modes: [5, 3, 24, 6, 9, 21], // Loiter, Auto, ZigZag, RTL, Land, SmartRTL
  },
};

export const PLANE_FLIGHT_MODE_PRESETS: Record<string, FlightModePreset> = {
  beginner: {
    nameKey: 'mavlink-config:mavlinkPresets.planeFlightMode.beginner.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.planeFlightMode.beginner.description',
    modes: [5, 5, 12, 12, 11, 11], // FBWA, FBWA, Loiter, Loiter, RTL, RTL
  },
  intermediate: {
    nameKey: 'mavlink-config:mavlinkPresets.planeFlightMode.intermediate.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.planeFlightMode.intermediate.description',
    modes: [5, 7, 12, 10, 11, 11], // FBWA, Cruise, Loiter, Auto, RTL, RTL
  },
  advanced: {
    nameKey: 'mavlink-config:mavlinkPresets.planeFlightMode.advanced.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.planeFlightMode.advanced.description',
    modes: [0, 4, 5, 12, 10, 11], // Manual, Acro, FBWA, Loiter, Auto, RTL
  },
  vtol: {
    nameKey: 'mavlink-config:mavlinkPresets.planeFlightMode.vtol.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.planeFlightMode.vtol.description',
    modes: [19, 19, 5, 5, 21, 21], // QLoiter, QLoiter, FBWA, FBWA, QRTL, QRTL
  },
};

// =============================================================================
// Skill Level Presets (Tuning)
// =============================================================================

export interface SkillPreset {
  nameKey: string;
  descriptionKey: string;
  params: Record<string, number>;
}

export const SKILL_PRESETS: Record<string, SkillPreset> = {
  beginner: {
    nameKey: 'mavlink-config:mavlinkPresets.skill.beginner.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.skill.beginner.description',
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
    nameKey: 'mavlink-config:mavlinkPresets.skill.intermediate.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.skill.intermediate.description',
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
    nameKey: 'mavlink-config:mavlinkPresets.skill.expert.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.skill.expert.description',
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
  nameKey: string;
  descriptionKey: string;
  params: Record<string, number>;
}

export const MISSION_PRESETS: Record<string, MissionPreset> = {
  mapping: {
    nameKey: 'mavlink-config:mavlinkPresets.mission.mapping.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.mission.mapping.description',
    params: {
      'WPNAV_SPEED': 500, // 5 m/s - slow for photos
      'WPNAV_ACCEL': 100,
      'WPNAV_RADIUS': 200, // 2m waypoint radius
      'LOIT_SPEED': 500,
      'ANGLE_MAX': 2000, // 20 degrees - keep level for camera
    },
  },
  surveillance: {
    nameKey: 'mavlink-config:mavlinkPresets.mission.surveillance.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.mission.surveillance.description',
    params: {
      'WPNAV_SPEED': 800, // 8 m/s
      'WPNAV_ACCEL': 150,
      'WPNAV_RADIUS': 300,
      'LOIT_SPEED': 800,
      'ANGLE_MAX': 3000, // 30 degrees
    },
  },
  sport: {
    nameKey: 'mavlink-config:mavlinkPresets.mission.sport.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.mission.sport.description',
    params: {
      'WPNAV_SPEED': 1500, // 15 m/s
      'WPNAV_ACCEL': 400,
      'WPNAV_RADIUS': 500,
      'LOIT_SPEED': 1500,
      'ANGLE_MAX': 5500, // 55 degrees
    },
  },
  cinema: {
    nameKey: 'mavlink-config:mavlinkPresets.mission.cinema.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.mission.cinema.description',
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
  nameKey: string;
  descriptionKey: string;
  params: Record<string, number>;
}

export const SAFETY_PRESETS: Record<string, SafetyPreset> = {
  maximum: {
    nameKey: 'mavlink-config:mavlinkPresets.safety.maximum.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.safety.maximum.description',
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
    nameKey: 'mavlink-config:mavlinkPresets.safety.balanced.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.safety.balanced.description',
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
    nameKey: 'mavlink-config:mavlinkPresets.safety.minimal.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.safety.minimal.description',
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

export const FAILSAFE_ACTIONS: Record<number, { name: string; descriptionKey: string; safe: boolean }> = {
  0: { name: 'Disabled', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.0', safe: false }, // i18n-exempt
  1: { name: 'RTL', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.1', safe: true }, // i18n-exempt
  2: { name: 'Land', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.2', safe: true }, // i18n-exempt
  3: { name: 'SmartRTL', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.3', safe: true }, // i18n-exempt
  4: { name: 'Brake', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.4', safe: true }, // i18n-exempt
  5: { name: 'Land', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.5', safe: true }, // i18n-exempt
};

// =============================================================================
// Arming Check Flags
// =============================================================================

export const ARMING_CHECKS: Record<number, { name: string; descriptionKey: string }> = {
  1: { name: 'All', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.1' }, // i18n-exempt
  2: { name: 'Barometer', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.2' }, // i18n-exempt
  4: { name: 'Compass', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.4' }, // i18n-exempt
  8: { name: 'GPS Lock', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.8' }, // i18n-exempt
  16: { name: 'INS', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.16' }, // i18n-exempt
  32: { name: 'Parameters', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.32' }, // i18n-exempt
  64: { name: 'RC Channels', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.64' }, // i18n-exempt
  128: { name: 'Board Voltage', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.128' }, // i18n-exempt
  256: { name: 'Battery Level', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.256' }, // i18n-exempt
  512: { name: 'Airspeed', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.512' }, // i18n-exempt
  1024: { name: 'Logging', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.1024' }, // i18n-exempt
  2048: { name: 'Safety Switch', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.2048' }, // i18n-exempt
  4096: { name: 'GPS Config', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.4096' }, // i18n-exempt
  8192: { name: 'System', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.8192' }, // i18n-exempt
  16384: { name: 'Mission', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.16384' }, // i18n-exempt
  32768: { name: 'Rangefinder', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.32768' }, // i18n-exempt
};

// =============================================================================
// Fence Types
// =============================================================================

export const FENCE_TYPES: Record<number, { name: string; descriptionKey: string }> = {
  0: { name: 'Disabled', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.0' }, // i18n-exempt
  1: { name: 'Altitude', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.1' }, // i18n-exempt
  2: { name: 'Circle', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.2' }, // i18n-exempt
  3: { name: 'Altitude + Circle', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.3' }, // i18n-exempt
  4: { name: 'Polygon', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.4' }, // i18n-exempt
  7: { name: 'All', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.7' }, // i18n-exempt
};

// =============================================================================
// Battery Monitor Types
// =============================================================================

export const BATTERY_MONITORS: Record<number, { name: string; descriptionKey: string }> = {
  0: { name: 'Disabled', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.0' }, // i18n-exempt
  3: { name: 'Analog Voltage Only', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.3' }, // i18n-exempt
  4: { name: 'Analog Voltage + Current', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.4' }, // i18n-exempt
  5: { name: 'Solo', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.5' }, // i18n-exempt
  6: { name: 'Bebop', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.6' }, // i18n-exempt
  7: { name: 'SMBus-Maxell', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.7' }, // i18n-exempt
  8: { name: 'UAVCAN', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.8' }, // i18n-exempt
  9: { name: 'BLHeli ESC', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.9' }, // i18n-exempt
  10: { name: 'Sum of Selected', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.10' }, // i18n-exempt
  11: { name: 'FuelFlow', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.11' }, // i18n-exempt
  12: { name: 'FuelLevel PWM', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.12' }, // i18n-exempt
};

// =============================================================================
// Battery Chemistry Types
// =============================================================================

export type BatteryChemistry = 'lipo' | 'lihv' | 'lion' | 'life';

export interface BatteryChemistryInfo {
  name: string;
  descriptionKey: string;
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
    descriptionKey: 'mavlink-config:mavlinkPresets.chemistry.lipo.description',
    cellFull: 4.2,
    cellNominal: 3.7,
    cellStorage: 3.8,
    cellLow: 3.6,
    cellCritical: 3.5,
    cellMin: 3.0,
  },
  lihv: {
    name: 'LiHV',
    descriptionKey: 'mavlink-config:mavlinkPresets.chemistry.lihv.description',
    cellFull: 4.35,
    cellNominal: 3.8,
    cellStorage: 3.9,
    cellLow: 3.7,
    cellCritical: 3.6,
    cellMin: 3.1,
  },
  lion: {
    name: 'Li-Ion',
    descriptionKey: 'mavlink-config:mavlinkPresets.chemistry.lion.description',
    cellFull: 4.2,
    cellNominal: 3.6,
    cellStorage: 3.7,
    cellLow: 3.2,
    cellCritical: 3.0,
    cellMin: 2.5,
  },
  life: {
    name: 'LiFePO4',
    descriptionKey: 'mavlink-config:mavlinkPresets.chemistry.life.description',
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
  nameKey: string;
  descriptionKey: string;
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
    nameKey: 'mavlink-config:mavlinkPresets.pid.beginner.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.pid.beginner.description',
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
    nameKey: 'mavlink-config:mavlinkPresets.pid.freestyle.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.pid.freestyle.description',
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
    nameKey: 'mavlink-config:mavlinkPresets.pid.racing.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.pid.racing.description',
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
    nameKey: 'mavlink-config:mavlinkPresets.pid.cinematic.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.pid.cinematic.description',
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
  description: string;
  nameKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  /** Abstract rate values - mapped to actual param names via RateScheme at apply time */
  values: RateValues;
}

export const RATE_PRESETS: Record<string, RatePreset> = {
  beginner: {
    name: 'Beginner', // i18n-exempt
    description: 'Slow & predictable - great for learning', // i18n-exempt
    nameKey: 'mavlink-config:mavlinkPresets.rate.beginner.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.rate.beginner.description',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    values: { rpRate: 90, yawRate: 45, rpExpo: 0.3, yawExpo: 0.2 },
  },
  freestyle: {
    name: 'Freestyle', // i18n-exempt
    description: 'Balanced for tricks & flow', // i18n-exempt
    nameKey: 'mavlink-config:mavlinkPresets.rate.freestyle.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.rate.freestyle.description',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    values: { rpRate: 180, yawRate: 90, rpExpo: 0.2, yawExpo: 0.15 },
  },
  racing: {
    name: 'Racing', // i18n-exempt
    description: 'Fast & responsive for speed', // i18n-exempt
    nameKey: 'mavlink-config:mavlinkPresets.rate.racing.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.rate.racing.description',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    values: { rpRate: 360, yawRate: 180, rpExpo: 0.1, yawExpo: 0.1 },
  },
  cinematic: {
    name: 'Cinematic', // i18n-exempt
    description: 'Ultra-smooth for filming', // i18n-exempt
    nameKey: 'mavlink-config:mavlinkPresets.rate.cinematic.name',
    descriptionKey: 'mavlink-config:mavlinkPresets.rate.cinematic.description',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    values: { rpRate: 60, yawRate: 30, rpExpo: 0.4, yawExpo: 0.3 },
  },
};
