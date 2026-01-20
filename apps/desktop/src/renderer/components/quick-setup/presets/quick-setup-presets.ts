/**
 * Quick Setup Presets
 *
 * Unified preset definitions that combine:
 * - Aircraft type (servo/motor mixers)
 * - PID tuning
 * - Rate tuning
 * - Flight modes
 * - Failsafe settings
 *
 * These presets provide one-click setup for different flying styles,
 * eliminating the need to configure each system separately.
 */

import type { MSPModeRange } from '@ardudeck/msp-ts';
import { BOX_ID } from '../../modes/presets/mode-presets';
import {
  PLATFORM_TYPE,
  SERVO_INPUT_SOURCE,
  type ServoMixerRule,
  type MotorMixerRule,
} from '../../servo-wizard/presets/servo-presets';

// ============================================================================
// Type Definitions
// ============================================================================

export interface PIDCoefficients {
  p: number;
  i: number;
  d: number;
}

export interface PIDConfig {
  roll: PIDCoefficients;
  pitch: PIDCoefficients;
  yaw: PIDCoefficients;
}

export interface RatesConfig {
  rcRate: number;
  rcExpo: number;
  rcPitchRate: number;
  rcPitchExpo: number;
  rcYawRate: number;
  rcYawExpo: number;
  rollPitchRate: number; // Legacy combined rate for old iNav
  rollRate: number;
  pitchRate: number;
  yawRate: number;
}

export interface FailsafeConfig {
  procedure: 'DROP' | 'LAND' | 'RTH';
  delay: number; // Seconds before failsafe activates
  throttleLow: number; // Throttle value during failsafe
  offDelay: number; // Seconds before disarm after landing
}

export interface AircraftConfig {
  platformType: number;
  servoMixerRules: Array<{
    servoIndex: number;
    inputSource: number;
    rate: number;
  }>;
  motorMixerRules: MotorMixerRule[];
}

export interface QuickSetupPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  tip: string;
  gradient: string;
  // What this preset targets
  category: 'multirotor' | 'fixed_wing';
  // Configuration sections
  pids: PIDConfig;
  rates: RatesConfig;
  modes: MSPModeRange[];
  wizardModes: number[]; // Box IDs to configure in wizard flow
  failsafe: FailsafeConfig;
  aircraft: AircraftConfig;
  // Tags for filtering/display
  tags: string[];
}

// ============================================================================
// Common Configurations (shared across presets)
// ============================================================================

// Multirotor motor mixer (Quad X)
const QUAD_X_MOTORS: MotorMixerRule[] = [
  { motorIndex: 0, throttle: 1.0, roll: -1.0, pitch: 1.0, yaw: -1.0 },  // Front Right
  { motorIndex: 1, throttle: 1.0, roll: -1.0, pitch: -1.0, yaw: 1.0 }, // Rear Right
  { motorIndex: 2, throttle: 1.0, roll: 1.0, pitch: 1.0, yaw: 1.0 },   // Front Left
  { motorIndex: 3, throttle: 1.0, roll: 1.0, pitch: -1.0, yaw: -1.0 }, // Rear Left
];

// Single motor for fixed-wing
const SINGLE_MOTOR: MotorMixerRule[] = [
  { motorIndex: 0, throttle: 1.0, roll: 0, pitch: 0, yaw: 0 },
];

// Flying wing elevon mixer
const FLYING_WING_SERVOS = [
  // Left elevon (servo 0): roll + pitch
  { servoIndex: 0, inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: 100 },
  { servoIndex: 0, inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
  // Right elevon (servo 1): -roll + pitch
  { servoIndex: 1, inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: -100 },
  { servoIndex: 1, inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
];

// Traditional airplane mixer
const TRADITIONAL_AIRPLANE_SERVOS = [
  // Ailerons (servo 0): roll
  { servoIndex: 0, inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: 100 },
  // Elevator (servo 1): pitch
  { servoIndex: 1, inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
  // Rudder (servo 2): yaw
  { servoIndex: 2, inputSource: SERVO_INPUT_SOURCE.STABILIZED_YAW, rate: 100 },
];

// ============================================================================
// Preset Definitions
// ============================================================================

export const QUICK_SETUP_PRESETS: Record<string, QuickSetupPreset> = {
  // ==========================================================================
  // BEGINNER - Safe & Stable
  // ==========================================================================
  beginner: {
    id: 'beginner',
    name: 'Beginner',
    icon: '🐣',
    description: 'Safe & stable for learning',
    tip: 'Self-leveling keeps you in control. Slow rates prevent overcorrection. Perfect for your first flights!',
    gradient: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    category: 'multirotor',
    tags: ['safe', 'stable', 'learning', 'first-flight'],

    pids: {
      roll: { p: 35, i: 40, d: 20 },
      pitch: { p: 38, i: 42, d: 22 },
      yaw: { p: 45, i: 50, d: 0 },
    },

    rates: {
      rcRate: 80,
      rcExpo: 20,
      rcPitchRate: 80,
      rcPitchExpo: 20,
      rcYawRate: 80,
      rcYawExpo: 20,
      rollPitchRate: 40, // Legacy
      rollRate: 40,
      pitchRate: 40,
      yawRate: 40,
    },

    modes: [
      // ARM on AUX1 high (1800-2100)
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE always on (self-level)
      { boxId: BOX_ID.ANGLE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE],

    failsafe: {
      procedure: 'LAND',
      delay: 4,
      throttleLow: 1000,
      offDelay: 10,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.MULTIROTOR,
      servoMixerRules: [],
      motorMixerRules: QUAD_X_MOTORS, // Quad X motor layout
    },
  },

  // ==========================================================================
  // FREESTYLE - Balanced for Tricks
  // ==========================================================================
  freestyle: {
    id: 'freestyle',
    name: 'Freestyle',
    icon: '🎭',
    description: 'Balanced for tricks & flow',
    tip: 'Three-position switch gives ANGLE/HORIZON/ACRO. AIRMODE keeps control at zero throttle for flips!',
    gradient: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    category: 'multirotor',
    tags: ['freestyle', 'tricks', 'acro', 'balanced'],

    pids: {
      roll: { p: 45, i: 45, d: 28 },
      pitch: { p: 48, i: 48, d: 30 },
      yaw: { p: 55, i: 50, d: 0 },
    },

    rates: {
      rcRate: 100,
      rcExpo: 15,
      rcPitchRate: 100,
      rcPitchExpo: 15,
      rcYawRate: 100,
      rcYawExpo: 10,
      rollPitchRate: 70,
      rollRate: 70,
      pitchRate: 70,
      yawRate: 65,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE on AUX2 low (recovery)
      { boxId: BOX_ID.ANGLE, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // HORIZON on AUX2 mid
      { boxId: BOX_ID.HORIZON, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // AIRMODE always on
      { boxId: BOX_ID.AIRMODE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.HORIZON, BOX_ID.AIRMODE],

    failsafe: {
      procedure: 'DROP',
      delay: 3,
      throttleLow: 1000,
      offDelay: 5,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.MULTIROTOR,
      servoMixerRules: [],
      motorMixerRules: QUAD_X_MOTORS, // Quad X motor layout
    },
  },

  // ==========================================================================
  // RACING - Fast & Responsive
  // ==========================================================================
  racing: {
    id: 'racing',
    name: 'Racing',
    icon: '🏎️',
    description: 'Fast & responsive for speed',
    tip: 'Pure ACRO for maximum control. High rates for quick corrections. Beeper helps find crashes!',
    gradient: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    category: 'multirotor',
    tags: ['racing', 'fast', 'competitive', 'acro'],

    pids: {
      roll: { p: 55, i: 50, d: 32 },
      pitch: { p: 58, i: 52, d: 34 },
      yaw: { p: 65, i: 55, d: 0 },
    },

    rates: {
      rcRate: 120,
      rcExpo: 5,
      rcPitchRate: 120,
      rcPitchExpo: 5,
      rcYawRate: 110,
      rcYawExpo: 0,
      rollPitchRate: 80,
      rollRate: 80,
      pitchRate: 80,
      yawRate: 70,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // AIRMODE always on
      { boxId: BOX_ID.AIRMODE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
      // BEEPER on AUX3 high (finder)
      { boxId: BOX_ID.BEEPER, auxChannel: 2, rangeStart: 1800, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.AIRMODE, BOX_ID.BEEPER],

    failsafe: {
      procedure: 'DROP',
      delay: 2,
      throttleLow: 1000,
      offDelay: 3,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.MULTIROTOR,
      servoMixerRules: [],
      motorMixerRules: QUAD_X_MOTORS, // Quad X motor layout
    },
  },

  // ==========================================================================
  // CINEMATIC - Ultra-Smooth for Filming
  // ==========================================================================
  cinematic: {
    id: 'cinematic',
    name: 'Cinematic',
    icon: '🎬',
    description: 'Ultra-smooth for filming',
    tip: 'Low rates + high expo = buttery smooth movements. GPS position hold for stable shots. RTH for safety.',
    gradient: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    category: 'multirotor',
    tags: ['cinematic', 'smooth', 'filming', 'video', 'gps'],

    pids: {
      roll: { p: 30, i: 35, d: 18 },
      pitch: { p: 32, i: 38, d: 20 },
      yaw: { p: 40, i: 45, d: 0 },
    },

    rates: {
      rcRate: 70,
      rcExpo: 40,
      rcPitchRate: 70,
      rcPitchExpo: 40,
      rcYawRate: 60,
      rcYawExpo: 30,
      rollPitchRate: 30,
      rollRate: 30,
      pitchRate: 30,
      yawRate: 25,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE always on (smooth, stable shots)
      { boxId: BOX_ID.ANGLE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
      // NAV POSHOLD on AUX2 mid (GPS position hold)
      { boxId: BOX_ID.NAV_POSHOLD, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // NAV RTH on AUX2 high
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.NAV_POSHOLD, BOX_ID.NAV_RTH],

    failsafe: {
      procedure: 'RTH',
      delay: 5,
      throttleLow: 1000,
      offDelay: 10,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.MULTIROTOR,
      servoMixerRules: [],
      motorMixerRules: QUAD_X_MOTORS, // Quad X motor layout
    },
  },

  // ==========================================================================
  // FLYING WING - Delta/Wing Aircraft with Elevon Mixing
  // ==========================================================================
  flyingWing: {
    id: 'flyingWing',
    name: 'Flying Wing',
    icon: '🔺',
    description: 'Delta wings & flying wings with elevon mixing',
    tip: 'Elevon mixing configured (left/right servos on CH3/CH4). Auto-launch, RTH, and waypoint navigation ready.',
    gradient: 'from-amber-500/20 to-orange-500/10 border-amber-500/30',
    category: 'fixed_wing',
    tags: ['flying-wing', 'delta', 'elevon', 'navigation'],

    pids: {
      roll: { p: 20, i: 30, d: 15 },
      pitch: { p: 20, i: 30, d: 15 },
      yaw: { p: 50, i: 45, d: 0 },
    },

    rates: {
      rcRate: 100,
      rcExpo: 30,
      rcPitchRate: 100,
      rcPitchExpo: 30,
      rcYawRate: 100,
      rcYawExpo: 20,
      rollPitchRate: 50,
      rollRate: 50,
      pitchRate: 50,
      yawRate: 50,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // NAV LAUNCH on AUX2 low (auto-launch)
      { boxId: BOX_ID.NAV_LAUNCH, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // NAV RTH on AUX2 mid
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // NAV WP on AUX2 high (waypoint mission)
      { boxId: BOX_ID.NAV_WP, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.NAV_LAUNCH, BOX_ID.NAV_RTH, BOX_ID.NAV_WP],

    failsafe: {
      procedure: 'RTH',
      delay: 5,
      throttleLow: 1200,
      offDelay: 30,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.AIRPLANE,
      servoMixerRules: FLYING_WING_SERVOS,
      motorMixerRules: [], // Firmware handles motor config for fixed-wing
    },
  },

  // ==========================================================================
  // TRAINER - Traditional 3-Channel Airplane for Beginners
  // ==========================================================================
  fwTrainer: {
    id: 'fwTrainer',
    name: 'Trainer Plane',
    icon: '🛫',
    description: 'Traditional airplane for beginners',
    tip: 'Classic aileron/elevator/rudder setup. Auto-level keeps wings stable. Perfect for learning fixed-wing flying.',
    gradient: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    category: 'fixed_wing',
    tags: ['airplane', 'trainer', 'beginner', 'traditional'],

    pids: {
      roll: { p: 15, i: 25, d: 10 },
      pitch: { p: 15, i: 25, d: 10 },
      yaw: { p: 40, i: 35, d: 0 },
    },

    rates: {
      rcRate: 80,
      rcExpo: 40,
      rcPitchRate: 80,
      rcPitchExpo: 40,
      rcYawRate: 80,
      rcYawExpo: 30,
      rollPitchRate: 35,
      rollRate: 35,
      pitchRate: 35,
      yawRate: 40,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE always on (auto-level)
      { boxId: BOX_ID.ANGLE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
      // NAV LAUNCH on AUX2 low
      { boxId: BOX_ID.NAV_LAUNCH, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // NAV RTH on AUX2 high
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.NAV_LAUNCH, BOX_ID.NAV_RTH],

    failsafe: {
      procedure: 'RTH',
      delay: 5,
      throttleLow: 1200,
      offDelay: 30,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.AIRPLANE,
      servoMixerRules: TRADITIONAL_AIRPLANE_SERVOS,
      motorMixerRules: [], // Firmware handles motor config for fixed-wing
    },
  },

  // ==========================================================================
  // SPORT PLANE - Agile Traditional Airplane
  // ==========================================================================
  fwSport: {
    id: 'fwSport',
    name: 'Sport Plane',
    icon: '✈️',
    description: 'Agile traditional airplane for experienced pilots',
    tip: 'Higher rates for aerobatics. Aileron/elevator/rudder setup. Switch between stabilized and acro modes.',
    gradient: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    category: 'fixed_wing',
    tags: ['airplane', 'sport', 'aerobatic', 'traditional'],

    pids: {
      roll: { p: 25, i: 35, d: 18 },
      pitch: { p: 25, i: 35, d: 18 },
      yaw: { p: 55, i: 50, d: 0 },
    },

    rates: {
      rcRate: 110,
      rcExpo: 20,
      rcPitchRate: 110,
      rcPitchExpo: 20,
      rcYawRate: 100,
      rcYawExpo: 15,
      rollPitchRate: 60,
      rollRate: 60,
      pitchRate: 60,
      yawRate: 55,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE on AUX2 low (stabilized recovery)
      { boxId: BOX_ID.ANGLE, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // HORIZON on AUX2 mid (acro with auto-level assist)
      { boxId: BOX_ID.HORIZON, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // NAV RTH on AUX3 high
      { boxId: BOX_ID.NAV_RTH, auxChannel: 2, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.HORIZON, BOX_ID.NAV_RTH],

    failsafe: {
      procedure: 'RTH',
      delay: 4,
      throttleLow: 1200,
      offDelay: 20,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.AIRPLANE,
      servoMixerRules: TRADITIONAL_AIRPLANE_SERVOS,
      motorMixerRules: [], // Firmware handles motor config for fixed-wing
    },
  },

  // ==========================================================================
  // GLIDER - For Soaring & Thermal Hunting
  // ==========================================================================
  fwGlider: {
    id: 'fwGlider',
    name: 'Glider',
    icon: '🪁',
    description: 'Efficient soaring & thermal hunting',
    tip: 'Optimized for glide efficiency. Low rates for precision. Soaring mode for thermals. Flying wing servo setup.',
    gradient: 'from-cyan-500/20 to-sky-500/10 border-cyan-500/30',
    category: 'fixed_wing',
    tags: ['glider', 'soaring', 'efficient', 'flying-wing'],

    pids: {
      roll: { p: 12, i: 20, d: 8 },
      pitch: { p: 12, i: 20, d: 8 },
      yaw: { p: 35, i: 30, d: 0 },
    },

    rates: {
      rcRate: 70,
      rcExpo: 50,
      rcPitchRate: 70,
      rcPitchExpo: 50,
      rcYawRate: 60,
      rcYawExpo: 40,
      rollPitchRate: 30,
      rollRate: 30,
      pitchRate: 30,
      yawRate: 35,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE on AUX2 low (stabilized)
      { boxId: BOX_ID.ANGLE, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // NAV CRUISE on AUX2 mid
      { boxId: BOX_ID.NAV_CRUISE, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // NAV RTH on AUX2 high
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.NAV_CRUISE, BOX_ID.NAV_RTH],

    failsafe: {
      procedure: 'RTH',
      delay: 8,
      throttleLow: 1000, // No throttle - glide
      offDelay: 60, // Long timeout for glide landing
    },

    aircraft: {
      platformType: PLATFORM_TYPE.AIRPLANE,
      servoMixerRules: FLYING_WING_SERVOS,
      motorMixerRules: [], // Firmware handles motor config for fixed-wing
    },
  },

  // ==========================================================================
  // LONG RANGE FPV - Extended Range Flying Wing
  // ==========================================================================
  fwLongRange: {
    id: 'fwLongRange',
    name: 'Long Range FPV',
    icon: '🌍',
    description: 'Extended range for FPV missions',
    tip: 'Flying wing setup optimized for efficiency. Full navigation suite with waypoints, cruise, and RTH.',
    gradient: 'from-indigo-500/20 to-purple-500/10 border-indigo-500/30',
    category: 'fixed_wing',
    tags: ['long-range', 'fpv', 'flying-wing', 'navigation'],

    pids: {
      roll: { p: 18, i: 28, d: 12 },
      pitch: { p: 18, i: 28, d: 12 },
      yaw: { p: 45, i: 40, d: 0 },
    },

    rates: {
      rcRate: 90,
      rcExpo: 35,
      rcPitchRate: 90,
      rcPitchExpo: 35,
      rcYawRate: 80,
      rcYawExpo: 25,
      rollPitchRate: 45,
      rollRate: 45,
      pitchRate: 45,
      yawRate: 45,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // NAV LAUNCH on AUX2 low
      { boxId: BOX_ID.NAV_LAUNCH, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // NAV CRUISE on AUX2 mid
      { boxId: BOX_ID.NAV_CRUISE, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // NAV WP on AUX2 high
      { boxId: BOX_ID.NAV_WP, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 },
      // NAV RTH on AUX3 high
      { boxId: BOX_ID.NAV_RTH, auxChannel: 2, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.NAV_LAUNCH, BOX_ID.NAV_CRUISE, BOX_ID.NAV_WP, BOX_ID.NAV_RTH],

    failsafe: {
      procedure: 'RTH',
      delay: 5,
      throttleLow: 1200,
      offDelay: 45,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.AIRPLANE,
      servoMixerRules: FLYING_WING_SERVOS,
      motorMixerRules: [], // Firmware handles motor config for fixed-wing
    },
  },

  // ==========================================================================
  // LONG RANGE - For Extended Flights (Multirotor)
  // ==========================================================================
  longRange: {
    id: 'longRange',
    name: 'Long Range',
    icon: '🛰️',
    description: 'Extended range with GPS safety',
    tip: 'Conservative PIDs for efficiency. GPS cruise and RTH for safety. ANGLE mode for easy recovery.',
    gradient: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30',
    category: 'multirotor',
    tags: ['long-range', 'gps', 'endurance', 'safe'],

    pids: {
      roll: { p: 35, i: 40, d: 22 },
      pitch: { p: 38, i: 42, d: 24 },
      yaw: { p: 50, i: 50, d: 0 },
    },

    rates: {
      rcRate: 90,
      rcExpo: 25,
      rcPitchRate: 90,
      rcPitchExpo: 25,
      rcYawRate: 80,
      rcYawExpo: 20,
      rollPitchRate: 45,
      rollRate: 45,
      pitchRate: 45,
      yawRate: 40,
    },

    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE on AUX2 low (recovery mode)
      { boxId: BOX_ID.ANGLE, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // NAV POSHOLD on AUX2 mid
      { boxId: BOX_ID.NAV_POSHOLD, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // NAV RTH on AUX2 high (return home)
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 },
      // NAV WP on AUX3 high (waypoint mission)
      { boxId: BOX_ID.NAV_WP, auxChannel: 2, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.NAV_POSHOLD, BOX_ID.NAV_RTH, BOX_ID.NAV_WP],

    failsafe: {
      procedure: 'RTH',
      delay: 3,
      throttleLow: 1000,
      offDelay: 15,
    },

    aircraft: {
      platformType: PLATFORM_TYPE.MULTIROTOR,
      servoMixerRules: [],
      motorMixerRules: QUAD_X_MOTORS, // Quad X motor layout
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all presets as an array
 */
export function getAllPresets(): QuickSetupPreset[] {
  return Object.values(QUICK_SETUP_PRESETS);
}

/**
 * Get presets filtered by category
 */
export function getPresetsByCategory(category: 'multirotor' | 'fixed_wing'): QuickSetupPreset[] {
  return getAllPresets().filter((p) => p.category === category);
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): QuickSetupPreset | undefined {
  return QUICK_SETUP_PRESETS[id];
}

/**
 * Get preset IDs that are recommended for beginners
 */
export function getBeginnerPresets(): QuickSetupPreset[] {
  return getAllPresets().filter((p) => p.tags.includes('safe') || p.tags.includes('learning'));
}

/**
 * Generate CLI commands for a preset (for legacy boards)
 * Returns an array of CLI commands to execute
 */
export function generateCliCommands(preset: QuickSetupPreset): string[] {
  const commands: string[] = [];

  // Platform type
  if (preset.aircraft.platformType === PLATFORM_TYPE.AIRPLANE) {
    commands.push('set platform_type = AIRPLANE');
  } else if (preset.aircraft.platformType === PLATFORM_TYPE.TRICOPTER) {
    commands.push('set platform_type = TRICOPTER');
  } else {
    commands.push('set platform_type = MULTIROTOR');
  }

  // PIDs (multirotor format - mc_p_roll, etc.)
  if (preset.category === 'multirotor') {
    commands.push(`set mc_p_roll = ${preset.pids.roll.p}`);
    commands.push(`set mc_i_roll = ${preset.pids.roll.i}`);
    commands.push(`set mc_d_roll = ${preset.pids.roll.d}`);
    commands.push(`set mc_p_pitch = ${preset.pids.pitch.p}`);
    commands.push(`set mc_i_pitch = ${preset.pids.pitch.i}`);
    commands.push(`set mc_d_pitch = ${preset.pids.pitch.d}`);
    commands.push(`set mc_p_yaw = ${preset.pids.yaw.p}`);
    commands.push(`set mc_i_yaw = ${preset.pids.yaw.i}`);
  } else {
    // Fixed-wing format
    commands.push(`set fw_p_roll = ${preset.pids.roll.p}`);
    commands.push(`set fw_i_roll = ${preset.pids.roll.i}`);
    commands.push(`set fw_ff_roll = ${preset.pids.roll.d}`);
    commands.push(`set fw_p_pitch = ${preset.pids.pitch.p}`);
    commands.push(`set fw_i_pitch = ${preset.pids.pitch.i}`);
    commands.push(`set fw_ff_pitch = ${preset.pids.pitch.d}`);
    commands.push(`set fw_p_yaw = ${preset.pids.yaw.p}`);
    commands.push(`set fw_i_yaw = ${preset.pids.yaw.i}`);
  }

  // Rates - iNav rate settings
  commands.push(`set roll_rate = ${preset.rates.rollRate}`);
  commands.push(`set pitch_rate = ${preset.rates.pitchRate}`);
  commands.push(`set yaw_rate = ${preset.rates.yawRate}`);
  commands.push(`set rc_expo = ${preset.rates.rcExpo}`);
  commands.push(`set rc_yaw_expo = ${preset.rates.rcYawExpo}`);

  // Failsafe
  commands.push(`set failsafe_procedure = ${preset.failsafe.procedure}`);
  commands.push(`set failsafe_delay = ${preset.failsafe.delay * 10}`); // iNav uses 10ths of second
  commands.push(`set failsafe_off_delay = ${preset.failsafe.offDelay * 10}`);
  commands.push(`set failsafe_throttle = ${preset.failsafe.throttleLow}`);

  // Servo mixer (smix) - reset first
  if (preset.aircraft.servoMixerRules.length > 0) {
    commands.push('smix reset');
    preset.aircraft.servoMixerRules.forEach((rule, index) => {
      commands.push(`smix ${index} ${rule.servoIndex} ${rule.inputSource} ${rule.rate} 0 0`);
    });
  }

  // Motor mixer (mmix) - reset first
  if (preset.aircraft.motorMixerRules.length > 0) {
    commands.push('mmix reset');
    preset.aircraft.motorMixerRules.forEach((rule) => {
      commands.push(`mmix ${rule.motorIndex} ${rule.throttle} ${rule.roll} ${rule.pitch} ${rule.yaw}`);
    });
  }

  // Modes (aux) - clear existing modes first, then set new ones
  // Clear first 20 mode slots
  for (let i = 0; i < 20; i++) {
    commands.push(`aux ${i} 0 0 900 900 0`);
  }
  // Set new modes
  preset.modes.forEach((mode, index) => {
    commands.push(`aux ${index} ${mode.boxId} ${mode.auxChannel} ${mode.rangeStart} ${mode.rangeEnd} 0`);
  });

  return commands;
}

/**
 * Get a summary of what a preset will configure
 */
export function getPresetSummary(preset: QuickSetupPreset): {
  sections: Array<{ name: string; description: string; items: string[] }>;
} {
  // Determine servo configuration type
  const hasElevonMixing = preset.aircraft.servoMixerRules.some(
    (r) => r.inputSource === SERVO_INPUT_SOURCE.STABILIZED_ROLL &&
           preset.aircraft.servoMixerRules.some(r2 => r2.servoIndex === r.servoIndex && r2.inputSource === SERVO_INPUT_SOURCE.STABILIZED_PITCH)
  );
  const servoConfig = hasElevonMixing
    ? ['Flying wing elevon mixing (2 servos)', 'Single motor']
    : preset.aircraft.platformType === PLATFORM_TYPE.AIRPLANE
      ? ['Traditional setup: Aileron/Elevator/Rudder', 'Single motor']
      : ['Quad X motor layout'];

  return {
    sections: [
      {
        name: 'Aircraft Type',
        description: preset.category === 'fixed_wing' ? 'Fixed Wing' : 'Multirotor',
        items: servoConfig,
      },
      {
        name: 'PID Tuning',
        description: `${preset.name} response`,
        items: [
          `Roll P: ${preset.pids.roll.p}, I: ${preset.pids.roll.i}, D: ${preset.pids.roll.d}`,
          `Pitch P: ${preset.pids.pitch.p}, I: ${preset.pids.pitch.i}, D: ${preset.pids.pitch.d}`,
          `Yaw P: ${preset.pids.yaw.p}, I: ${preset.pids.yaw.i}`,
        ],
      },
      {
        name: 'Rates',
        description: `${preset.rates.rollRate}% max rotation`,
        items: [
          `RC Rate: ${preset.rates.rcRate}`,
          `Expo: ${preset.rates.rcExpo}%`,
          `Roll/Pitch Rate: ${preset.rates.rollRate}`,
          `Yaw Rate: ${preset.rates.yawRate}`,
        ],
      },
      {
        name: 'Flight Modes',
        description: `${preset.modes.length} modes configured`,
        items: preset.wizardModes.map((boxId) => {
          const mode = preset.modes.find((m) => m.boxId === boxId);
          if (!mode) return '';
          const channelName = `AUX${mode.auxChannel + 1}`;
          return `${getModeName(boxId)} on ${channelName}`;
        }).filter(Boolean),
      },
      {
        name: 'Failsafe',
        description: preset.failsafe.procedure,
        items: [
          `Action: ${preset.failsafe.procedure}`,
          `Delay: ${preset.failsafe.delay}s`,
        ],
      },
    ],
  };
}

// Mode name lookup (iNav permanent box IDs)
function getModeName(boxId: number): string {
  const names: Record<number, string> = {
    [BOX_ID.ARM]: 'ARM',
    [BOX_ID.ANGLE]: 'ANGLE',
    [BOX_ID.HORIZON]: 'HORIZON',
    [BOX_ID.NAV_ALTHOLD]: 'NAV ALTHOLD',
    [BOX_ID.HEADING_HOLD]: 'HEADING HOLD',
    [BOX_ID.NAV_RTH]: 'NAV RTH',
    [BOX_ID.NAV_POSHOLD]: 'NAV POSHOLD',
    [BOX_ID.MANUAL]: 'MANUAL',
    [BOX_ID.BEEPER]: 'BEEPER',
    [BOX_ID.FAILSAFE]: 'FAILSAFE',
    [BOX_ID.NAV_WP]: 'NAV WP',
    [BOX_ID.AIRMODE]: 'AIRMODE',
    [BOX_ID.HOME_RESET]: 'HOME RESET',
    [BOX_ID.GCS_NAV]: 'GCS NAV',
    [BOX_ID.TURN_ASSIST]: 'TURN ASSIST',
    [BOX_ID.NAV_LAUNCH]: 'NAV LAUNCH',
    [BOX_ID.NAV_CRUISE]: 'NAV CRUISE',
    [BOX_ID.PREARM]: 'PREARM',
    [BOX_ID.TURTLE]: 'TURTLE',
    [BOX_ID.NAV_COURSE_HOLD]: 'COURSE HOLD',
  };
  return names[boxId] || `Mode ${boxId}`;
}
