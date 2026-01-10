/**
 * MAVLink/ArduPilot Configuration Presets
 *
 * Provides one-click configurations for:
 * - Skill levels (Beginner, Intermediate, Expert)
 * - Mission types (Mapping, Surveillance, Sport, Cinema)
 * - Flight mode templates
 * - Safety configurations
 */

// =============================================================================
// ArduCopter Flight Modes
// =============================================================================

export const COPTER_MODES: Record<number, { name: string; description: string; icon: string; safe: boolean }> = {
  0: { name: 'Stabilize', description: 'Manual flight with self-leveling', icon: '✋', safe: true },
  1: { name: 'Acro', description: 'Full manual control, no self-leveling', icon: '🎮', safe: false },
  2: { name: 'AltHold', description: 'Altitude hold with manual position', icon: '📏', safe: true },
  3: { name: 'Auto', description: 'Follow mission waypoints', icon: '🗺️', safe: true },
  4: { name: 'Guided', description: 'Fly to GCS-commanded points', icon: '📍', safe: true },
  5: { name: 'Loiter', description: 'Hold position and altitude', icon: '🔒', safe: true },
  6: { name: 'RTL', description: 'Return to launch point', icon: '🏠', safe: true },
  7: { name: 'Circle', description: 'Circle around a point', icon: '⭕', safe: true },
  9: { name: 'Land', description: 'Automatic landing', icon: '🛬', safe: true },
  11: { name: 'Drift', description: 'Like Stabilize but with drift', icon: '💨', safe: false },
  13: { name: 'Sport', description: 'Stabilize with higher rates', icon: '🏃', safe: false },
  14: { name: 'Flip', description: 'Automatic flip maneuver', icon: '🔄', safe: false },
  15: { name: 'AutoTune', description: 'Automatic PID tuning', icon: '🔧', safe: true },
  16: { name: 'PosHold', description: 'Position hold like Loiter', icon: '📌', safe: true },
  17: { name: 'Brake', description: 'Stop immediately', icon: '🛑', safe: true },
  18: { name: 'Throw', description: 'Throw to start', icon: '🤾', safe: false },
  19: { name: 'Avoid_ADSB', description: 'Avoid other aircraft', icon: '✈️', safe: true },
  20: { name: 'Guided_NoGPS', description: 'Guided without GPS', icon: '📡', safe: false },
  21: { name: 'Smart_RTL', description: 'Return via original path', icon: '↩️', safe: true },
  22: { name: 'FlowHold', description: 'Position hold with optical flow', icon: '👁️', safe: true },
  23: { name: 'Follow', description: 'Follow another vehicle', icon: '🚶', safe: true },
  24: { name: 'ZigZag', description: 'Zigzag survey pattern', icon: '〰️', safe: true },
  25: { name: 'SystemID', description: 'System identification', icon: '📊', safe: false },
  26: { name: 'Heli_Autorotate', description: 'Heli autorotation', icon: '🚁', safe: false },
  27: { name: 'Auto RTL', description: 'RTL then Auto continue', icon: '🔁', safe: true },
};

// =============================================================================
// Flight Mode Presets
// =============================================================================

export interface FlightModePreset {
  name: string;
  description: string;
  icon: string;
  color: string;
  modes: number[]; // FLTMODE1-6 values
}

export const FLIGHT_MODE_PRESETS: Record<string, FlightModePreset> = {
  beginner: {
    name: 'Beginner Safe',
    description: 'Safe modes only - Stabilize, AltHold, Loiter, RTL',
    icon: '🛡️',
    color: 'from-green-500/20 to-emerald-500/10',
    modes: [0, 2, 5, 6, 9, 6], // Stabilize, AltHold, Loiter, RTL, Land, RTL
  },
  intermediate: {
    name: 'Intermediate',
    description: 'Add Auto and PosHold for missions',
    icon: '📈',
    color: 'from-blue-500/20 to-cyan-500/10',
    modes: [0, 2, 5, 3, 16, 6], // Stabilize, AltHold, Loiter, Auto, PosHold, RTL
  },
  advanced: {
    name: 'Advanced',
    description: 'Full control with Acro and Sport modes',
    icon: '🎯',
    color: 'from-purple-500/20 to-pink-500/10',
    modes: [0, 1, 13, 5, 3, 6], // Stabilize, Acro, Sport, Loiter, Auto, RTL
  },
  mapping: {
    name: 'Mapping/Survey',
    description: 'Optimized for aerial mapping missions',
    icon: '🗺️',
    color: 'from-amber-500/20 to-orange-500/10',
    modes: [5, 3, 24, 6, 9, 21], // Loiter, Auto, ZigZag, RTL, Land, SmartRTL
  },
};

// =============================================================================
// Skill Level Presets (Tuning)
// =============================================================================

export interface SkillPreset {
  name: string;
  description: string;
  icon: string;
  color: string;
  params: Record<string, number>;
}

export const SKILL_PRESETS: Record<string, SkillPreset> = {
  beginner: {
    name: 'Beginner',
    description: 'Soft, forgiving response. Great for learning.',
    icon: '🛡️',
    color: 'from-green-500/20 to-emerald-500/10',
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
    icon: '📈',
    color: 'from-blue-500/20 to-cyan-500/10',
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
    icon: '🎯',
    color: 'from-red-500/20 to-orange-500/10',
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
  icon: string;
  color: string;
  params: Record<string, number>;
}

export const MISSION_PRESETS: Record<string, MissionPreset> = {
  mapping: {
    name: 'Mapping/Survey',
    description: 'Slow, stable flight for aerial mapping and photogrammetry.',
    icon: '🗺️',
    color: 'from-amber-500/20 to-orange-500/10',
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
    icon: '👁️',
    color: 'from-purple-500/20 to-pink-500/10',
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
    icon: '🏃',
    color: 'from-blue-500/20 to-cyan-500/10',
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
    icon: '🎬',
    color: 'from-rose-500/20 to-red-500/10',
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
  icon: string;
  color: string;
  params: Record<string, number>;
}

export const SAFETY_PRESETS: Record<string, SafetyPreset> = {
  maximum: {
    name: 'Maximum Safety',
    description: 'All safety features enabled. Recommended for beginners.',
    icon: '🛡️',
    color: 'from-green-500/20 to-emerald-500/10',
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
    icon: '⚖️',
    color: 'from-blue-500/20 to-cyan-500/10',
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
    icon: '⚡',
    color: 'from-orange-500/20 to-red-500/10',
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
 * Get a safe default flight mode preset for beginners
 */
export function getDefaultFlightModes(): number[] {
  return FLIGHT_MODE_PRESETS.beginner.modes;
}

/**
 * Check if a mode is considered safe for beginners
 */
export function isModeSafe(modeNum: number): boolean {
  return COPTER_MODES[modeNum]?.safe ?? false;
}

/**
 * Get mode info by number
 */
export function getModeInfo(modeNum: number) {
  return COPTER_MODES[modeNum] ?? { name: 'Unknown', description: 'Unknown mode', icon: '❓', safe: false };
}

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
