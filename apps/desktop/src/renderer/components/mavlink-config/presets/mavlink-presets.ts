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
  description: string;
  modes: number[]; // FLTMODE1-6 values
}

export const FLIGHT_MODE_PRESETS: Record<string, FlightModePreset> = {
  beginner: {
    name: 'Beginner Safe',
    description: 'Safe modes only - Stabilize, AltHold, Loiter, RTL',
    modes: [0, 2, 5, 6, 9, 6], // Stabilize, AltHold, Loiter, RTL, Land, RTL
  },
  intermediate: {
    name: 'Intermediate',
    description: 'Add Auto and PosHold for missions',
    modes: [0, 2, 5, 3, 16, 6], // Stabilize, AltHold, Loiter, Auto, PosHold, RTL
  },
  advanced: {
    name: 'Advanced',
    description: 'Full control with Acro and Sport modes',
    modes: [0, 1, 13, 5, 3, 6], // Stabilize, Acro, Sport, Loiter, Auto, RTL
  },
  mapping: {
    name: 'Mapping/Survey',
    description: 'Optimized for aerial mapping missions',
    modes: [5, 3, 24, 6, 9, 21], // Loiter, Auto, ZigZag, RTL, Land, SmartRTL
  },
};

// =============================================================================
// Skill Level Presets (Tuning)
// =============================================================================

export interface SkillPreset {
  name: string;
  description: string;
  params: Record<string, number>;
}

export const SKILL_PRESETS: Record<string, SkillPreset> = {
  beginner: {
    name: 'Beginner',
    description: 'Soft, forgiving response. Great for learning.',
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
    description: 'Balanced response for general flying.',
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
    description: 'Aggressive response for experienced pilots.',
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
  description: string;
  params: Record<string, number>;
}

export const MISSION_PRESETS: Record<string, MissionPreset> = {
  mapping: {
    name: 'Mapping/Survey',
    description: 'Slow, stable flight for aerial mapping and photogrammetry.',
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
    description: 'Moderate speed, good stability for video.',
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
    description: 'Fast, responsive flight for fun flying.',
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
    description: 'Ultra-smooth movements for professional video.',
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
  description: string;
  params: Record<string, number>;
}

export const SAFETY_PRESETS: Record<string, SafetyPreset> = {
  maximum: {
    name: 'Maximum Safety',
    description: 'All safety features enabled. Recommended for beginners.',
    params: {
      'FS_THR_ENABLE': 1, // RTL on throttle failsafe
      'FS_GCS_ENABLE': 1, // RTL on GCS failsafe
      'FS_BATT_ENABLE': 2, // Land on battery failsafe
      'FENCE_ENABLE': 1,
      'FENCE_TYPE': 7, // All fence types
      'ARMING_CHECK': 1, // All arming checks
    },
  },
  balanced: {
    name: 'Balanced',
    description: 'Essential safety features without being restrictive.',
    params: {
      'FS_THR_ENABLE': 1,
      'FS_GCS_ENABLE': 0, // No GCS failsafe
      'FS_BATT_ENABLE': 1, // RTL on battery failsafe
      'FENCE_ENABLE': 1,
      'FENCE_TYPE': 3, // Altitude + circle only
      'ARMING_CHECK': 1,
    },
  },
  minimal: {
    name: 'Minimal',
    description: 'Only critical safety features. For experienced pilots.',
    params: {
      'FS_THR_ENABLE': 1, // Keep throttle failsafe
      'FS_GCS_ENABLE': 0,
      'FS_BATT_ENABLE': 0,
      'FENCE_ENABLE': 0,
      'ARMING_CHECK': 0, // Bypass arming checks (dangerous!)
    },
  },
};

// =============================================================================
// Failsafe Actions
// =============================================================================

export const FAILSAFE_ACTIONS: Record<number, { name: string; description: string; safe: boolean }> = {
  0: { name: 'Disabled', description: 'No action taken', safe: false },
  1: { name: 'RTL', description: 'Return to launch point', safe: true },
  2: { name: 'Land', description: 'Land immediately', safe: true },
  3: { name: 'SmartRTL', description: 'Return via original path', safe: true },
  4: { name: 'Brake', description: 'Stop and hover', safe: true },
  5: { name: 'Land', description: 'Land at current position', safe: true },
};

// =============================================================================
// Arming Check Flags
// =============================================================================

export const ARMING_CHECKS: Record<number, { name: string; description: string }> = {
  1: { name: 'All', description: 'Enable all arming checks' },
  2: { name: 'Barometer', description: 'Check barometer health' },
  4: { name: 'Compass', description: 'Check compass health and calibration' },
  8: { name: 'GPS Lock', description: 'Require GPS lock before arming' },
  16: { name: 'INS', description: 'Check accelerometer/gyro health' },
  32: { name: 'Parameters', description: 'Check for invalid parameters' },
  64: { name: 'RC Channels', description: 'Check RC receiver is working' },
  128: { name: 'Board Voltage', description: 'Check board voltage is stable' },
  256: { name: 'Battery Level', description: 'Check battery has sufficient charge' },
  512: { name: 'Airspeed', description: 'Check airspeed sensor (planes)' },
  1024: { name: 'Logging', description: 'Check logging is working' },
  2048: { name: 'Safety Switch', description: 'Check safety switch is disengaged' },
  4096: { name: 'GPS Config', description: 'Check GPS configuration' },
  8192: { name: 'System', description: 'Check system health' },
  16384: { name: 'Mission', description: 'Check mission is valid' },
  32768: { name: 'Rangefinder', description: 'Check rangefinder health' },
};

// =============================================================================
// Fence Types
// =============================================================================

export const FENCE_TYPES: Record<number, { name: string; description: string }> = {
  0: { name: 'Disabled', description: 'No geofence active' },
  1: { name: 'Altitude', description: 'Maximum altitude limit' },
  2: { name: 'Circle', description: 'Circular boundary around home' },
  3: { name: 'Altitude + Circle', description: 'Both altitude and circular limits' },
  4: { name: 'Polygon', description: 'Custom polygon boundary' },
  7: { name: 'All', description: 'Altitude, circle, and polygon' },
};

// =============================================================================
// Battery Monitor Types
// =============================================================================

export const BATTERY_MONITORS: Record<number, { name: string; description: string }> = {
  0: { name: 'Disabled', description: 'No battery monitoring' },
  3: { name: 'Analog Voltage Only', description: 'Basic voltage monitoring' },
  4: { name: 'Analog Voltage + Current', description: 'Full power monitoring' },
  5: { name: 'Solo', description: '3DR Solo battery' },
  6: { name: 'Bebop', description: 'Parrot Bebop battery' },
  7: { name: 'SMBus-Maxell', description: 'Maxell smart battery' },
  8: { name: 'UAVCAN', description: 'UAVCAN battery' },
  9: { name: 'BLHeli ESC', description: 'BLHeli telemetry' },
  10: { name: 'Sum of Selected', description: 'Sum multiple monitors' },
  11: { name: 'FuelFlow', description: 'Fuel flow sensor' },
  12: { name: 'FuelLevel PWM', description: 'Fuel level PWM sensor' },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate LiPo cell voltages
 */
export function getLiPoVoltages(cells: number) {
  return {
    nominal: cells * 3.7,
    full: cells * 4.2,
    storage: cells * 3.8,
    low: cells * 3.5,
    critical: cells * 3.3,
    min: cells * 3.0,
  };
}

// =============================================================================
// PID Tuning Presets (ArduPilot)
// =============================================================================

export interface PidPreset {
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  params: {
    // Roll PIDs
    ATC_RAT_RLL_P: number;
    ATC_RAT_RLL_I: number;
    ATC_RAT_RLL_D: number;
    ATC_RAT_RLL_FF: number;
    // Pitch PIDs
    ATC_RAT_PIT_P: number;
    ATC_RAT_PIT_I: number;
    ATC_RAT_PIT_D: number;
    ATC_RAT_PIT_FF: number;
    // Yaw PIDs
    ATC_RAT_YAW_P: number;
    ATC_RAT_YAW_I: number;
    ATC_RAT_YAW_D: number;
    ATC_RAT_YAW_FF: number;
  };
}

export const PID_PRESETS: Record<string, PidPreset> = {
  beginner: {
    name: 'Beginner',
    description: 'Smooth & forgiving - great for learning',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    params: {
      ATC_RAT_RLL_P: 0.08,
      ATC_RAT_RLL_I: 0.08,
      ATC_RAT_RLL_D: 0.003,
      ATC_RAT_RLL_FF: 0,
      ATC_RAT_PIT_P: 0.08,
      ATC_RAT_PIT_I: 0.08,
      ATC_RAT_PIT_D: 0.003,
      ATC_RAT_PIT_FF: 0,
      ATC_RAT_YAW_P: 0.15,
      ATC_RAT_YAW_I: 0.015,
      ATC_RAT_YAW_D: 0,
      ATC_RAT_YAW_FF: 0,
    },
  },
  freestyle: {
    name: 'Freestyle',
    description: 'Responsive & smooth for tricks',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    params: {
      ATC_RAT_RLL_P: 0.135,
      ATC_RAT_RLL_I: 0.135,
      ATC_RAT_RLL_D: 0.0036,
      ATC_RAT_RLL_FF: 0,
      ATC_RAT_PIT_P: 0.135,
      ATC_RAT_PIT_I: 0.135,
      ATC_RAT_PIT_D: 0.0036,
      ATC_RAT_PIT_FF: 0,
      ATC_RAT_YAW_P: 0.2,
      ATC_RAT_YAW_I: 0.02,
      ATC_RAT_YAW_D: 0,
      ATC_RAT_YAW_FF: 0,
    },
  },
  racing: {
    name: 'Racing',
    description: 'Snappy & precise for speed',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    params: {
      ATC_RAT_RLL_P: 0.18,
      ATC_RAT_RLL_I: 0.18,
      ATC_RAT_RLL_D: 0.004,
      ATC_RAT_RLL_FF: 0,
      ATC_RAT_PIT_P: 0.18,
      ATC_RAT_PIT_I: 0.18,
      ATC_RAT_PIT_D: 0.004,
      ATC_RAT_PIT_FF: 0,
      ATC_RAT_YAW_P: 0.25,
      ATC_RAT_YAW_I: 0.025,
      ATC_RAT_YAW_D: 0,
      ATC_RAT_YAW_FF: 0,
    },
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Ultra-smooth for video',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    params: {
      ATC_RAT_RLL_P: 0.06,
      ATC_RAT_RLL_I: 0.06,
      ATC_RAT_RLL_D: 0.002,
      ATC_RAT_RLL_FF: 0,
      ATC_RAT_PIT_P: 0.06,
      ATC_RAT_PIT_I: 0.06,
      ATC_RAT_PIT_D: 0.002,
      ATC_RAT_PIT_FF: 0,
      ATC_RAT_YAW_P: 0.12,
      ATC_RAT_YAW_I: 0.012,
      ATC_RAT_YAW_D: 0,
      ATC_RAT_YAW_FF: 0,
    },
  },
};

// Default ArduPilot PIDs for reset
export const DEFAULT_ARDUPILOT_PIDS = {
  ATC_RAT_RLL_P: 0.135,
  ATC_RAT_RLL_I: 0.135,
  ATC_RAT_RLL_D: 0.0036,
  ATC_RAT_RLL_FF: 0,
  ATC_RAT_PIT_P: 0.135,
  ATC_RAT_PIT_I: 0.135,
  ATC_RAT_PIT_D: 0.0036,
  ATC_RAT_PIT_FF: 0,
  ATC_RAT_YAW_P: 0.18,
  ATC_RAT_YAW_I: 0.018,
  ATC_RAT_YAW_D: 0,
  ATC_RAT_YAW_FF: 0,
};

// =============================================================================
// Rate Presets (ArduPilot)
// =============================================================================

export interface RatePreset {
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  params: {
    ACRO_RP_RATE: number;  // Roll/Pitch rate in deg/s
    ACRO_Y_RATE: number;   // Yaw rate in deg/s
    ACRO_RP_EXPO: number;  // Roll/Pitch expo (0-1)
    ACRO_Y_EXPO: number;   // Yaw expo (0-1)
  };
}

export const RATE_PRESETS: Record<string, RatePreset> = {
  beginner: {
    name: 'Beginner',
    description: 'Slow & predictable - great for learning',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    params: {
      ACRO_RP_RATE: 90,
      ACRO_Y_RATE: 45,
      ACRO_RP_EXPO: 0.3,
      ACRO_Y_EXPO: 0.2,
    },
  },
  freestyle: {
    name: 'Freestyle',
    description: 'Balanced for tricks & flow',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    params: {
      ACRO_RP_RATE: 180,
      ACRO_Y_RATE: 90,
      ACRO_RP_EXPO: 0.2,
      ACRO_Y_EXPO: 0.15,
    },
  },
  racing: {
    name: 'Racing',
    description: 'Fast & responsive for speed',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    params: {
      ACRO_RP_RATE: 360,
      ACRO_Y_RATE: 180,
      ACRO_RP_EXPO: 0.1,
      ACRO_Y_EXPO: 0.1,
    },
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Ultra-smooth for filming',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    params: {
      ACRO_RP_RATE: 60,
      ACRO_Y_RATE: 30,
      ACRO_RP_EXPO: 0.4,
      ACRO_Y_EXPO: 0.3,
    },
  },
};

// Default ArduPilot rates for reset
export const DEFAULT_ARDUPILOT_RATES = {
  ACRO_RP_RATE: 180,
  ACRO_Y_RATE: 90,
  ACRO_RP_EXPO: 0,
  ACRO_Y_EXPO: 0,
};
